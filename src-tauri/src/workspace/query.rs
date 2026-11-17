//! Match conditions shared by project search and replace, so a preview always
//! changes exactly what the search showed.
use regex::{Regex, RegexBuilder};
use serde::Deserialize;

const MAX_QUERY_LENGTH: usize = 512;
const MAX_PATTERNS: usize = 32;
const MAX_PATTERN_LENGTH: usize = 256;
/// Compiled program and lazy DFA caps. The regex engine runs in linear time,
/// so these bound memory for hostile patterns such as `\w{1000}{1000}`.
const REGEX_SIZE_LIMIT: usize = 4 * 1024 * 1024;

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
pub struct SearchOptions {
    pub case_sensitive: bool,
    pub regex: bool,
    pub whole_word: bool,
    /// Comma-separated globs; empty means every file.
    pub include: String,
    pub exclude: String,
}

pub(super) struct Matcher {
    pattern: Regex,
    /// Regex mode expands `$1`/`${name}` in replacements; literal mode does not.
    expand: bool,
    include: Option<Regex>,
    exclude: Option<Regex>,
}

/// Last line of a regex error, e.g. `error: unclosed group`, without the
/// multi-line caret diagram.
fn regex_error(error: regex::Error) -> String {
    match error {
        regex::Error::CompiledTooBig(_) => "정규식이 너무 복잡합니다.".into(),
        error => {
            let text = error.to_string();
            let detail = text.lines().last().unwrap_or_default().trim();
            format!(
                "잘못된 정규식: {}",
                detail.strip_prefix("error: ").unwrap_or(detail)
            )
        }
    }
}

fn build(source: &str, case_insensitive: bool) -> Result<Regex, regex::Error> {
    RegexBuilder::new(source)
        .case_insensitive(case_insensitive)
        .multi_line(true)
        .size_limit(REGEX_SIZE_LIMIT)
        .dfa_size_limit(REGEX_SIZE_LIMIT)
        .build()
}

/// Regex source for one glob. Patterns without `/` match a file or folder name
/// at any depth (`*.md`, `drafts`); patterns with `/` are relative to the
/// project root (`docs/**/*.md`). A matching folder includes everything in it.
fn glob_source(glob: &str) -> String {
    let normalized = glob.replace('\\', "/");
    let trimmed = normalized
        .trim_start_matches("./")
        .trim_start_matches('/')
        .trim_end_matches('/');
    let mut source = String::new();
    let mut chars = trimmed.chars().peekable();
    while let Some(char) = chars.next() {
        match char {
            '*' if chars.peek() == Some(&'*') => {
                chars.next();
                if chars.peek() == Some(&'/') {
                    chars.next();
                    source.push_str("(?:.*/)?");
                } else {
                    source.push_str(".*");
                }
            }
            '*' => source.push_str("[^/]*"),
            '?' => source.push_str("[^/]"),
            char => source.push_str(&regex::escape(char.encode_utf8(&mut [0; 4]))),
        }
    }
    let anywhere = if trimmed.contains('/') {
        ""
    } else {
        "(?:.*/)?"
    };
    format!("{anywhere}{source}(?:/.*)?")
}

fn glob_list(list: &str) -> Result<Option<Regex>, String> {
    let globs: Vec<&str> = list
        .split(',')
        .map(str::trim)
        .filter(|glob| !glob.is_empty())
        .collect();
    if globs.is_empty() {
        return Ok(None);
    }
    if globs.len() > MAX_PATTERNS || globs.iter().any(|glob| glob.len() > MAX_PATTERN_LENGTH) {
        return Err("파일 패턴이 너무 많거나 깁니다.".into());
    }
    let sources: Vec<String> = globs.iter().map(|glob| glob_source(glob)).collect();
    // Windows paths compare without case.
    build(&format!("^(?:{})$", sources.join("|")), true)
        .map(Some)
        .map_err(|_| "파일 패턴이 너무 복잡합니다.".into())
}

impl Matcher {
    pub fn new(query: &str, options: &SearchOptions) -> Result<Self, String> {
        if query.is_empty() || query.len() > MAX_QUERY_LENGTH {
            return Err("검색어 길이가 올바르지 않습니다.".into());
        }
        let source = if options.regex {
            query.to_string()
        } else {
            regex::escape(query)
        };
        let source = if options.whole_word {
            format!(r"\b(?:{source})\b")
        } else {
            source
        };
        Ok(Self {
            pattern: build(&source, !options.case_sensitive).map_err(regex_error)?,
            expand: options.regex,
            include: glob_list(&options.include)?,
            exclude: glob_list(&options.exclude)?,
        })
    }

    /// Whether a root-relative path passes the include and exclude patterns.
    pub fn includes(&self, path: &str) -> bool {
        self.include
            .as_ref()
            .is_none_or(|include| include.is_match(path))
            && !self
                .exclude
                .as_ref()
                .is_some_and(|exclude| exclude.is_match(path))
    }

    /// Non-empty matches. Empty ones (`a*`, `^`) would list every position and
    /// insert text everywhere, so search and replace both skip them.
    pub fn find_iter<'t>(&'t self, text: &'t str) -> impl Iterator<Item = regex::Match<'t>> {
        self.pattern
            .find_iter(text)
            .filter(|found| !found.is_empty())
    }

    /// Text with every non-empty match replaced and the replacement count, or
    /// `None` once the result would exceed `limit` bytes.
    pub fn replace(&self, text: &str, replacement: &str, limit: usize) -> Option<(String, usize)> {
        // Each `$` reference expands to at most the whole match.
        let references = if self.expand {
            replacement.matches('$').count()
        } else {
            0
        };
        let mut result = String::new();
        let (mut last, mut count) = (0, 0);
        for captures in self.pattern.captures_iter(text) {
            let whole = captures.get(0)?;
            if whole.is_empty() {
                continue;
            }
            let bound = (whole.start() - last)
                .checked_add(replacement.len())?
                .checked_add(references.checked_mul(whole.len())?)?;
            if result.len().checked_add(bound)? > limit {
                return None;
            }
            result.push_str(&text[last..whole.start()]);
            if self.expand {
                captures.expand(replacement, &mut result);
            } else {
                result.push_str(replacement);
            }
            last = whole.end();
            count += 1;
        }
        if result.len() + (text.len() - last) > limit {
            return None;
        }
        result.push_str(&text[last..]);
        Some((result, count))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options(regex: bool, whole_word: bool, case_sensitive: bool) -> SearchOptions {
        SearchOptions {
            case_sensitive,
            regex,
            whole_word,
            ..SearchOptions::default()
        }
    }

    #[test]
    fn literal_regex_and_whole_word_matching() {
        let text = "a.b axb 단어 단어들 word words";
        let found = |query: &str, options: SearchOptions| {
            Matcher::new(query, &options)
                .unwrap()
                .find_iter(text)
                .map(|found| found.as_str().to_string())
                .collect::<Vec<_>>()
        };
        assert_eq!(found("a.b", options(false, false, false)), ["a.b"]);
        assert_eq!(found("a.b", options(true, false, false)), ["a.b", "axb"]);
        assert_eq!(found("word", options(false, true, false)), ["word"]);
        assert_eq!(found("단어", options(false, true, false)), ["단어"]);
        assert_eq!(
            found("WORD", options(false, false, true)),
            Vec::<String>::new()
        );
        assert_eq!(found("^a", options(true, false, false)), ["a"]);
        assert!(found("x*", options(true, false, false)) == ["x"]);
    }

    #[test]
    fn invalid_or_oversized_patterns_are_rejected_with_a_short_reason() {
        let error = Matcher::new("(a", &options(true, false, false))
            .err()
            .unwrap();
        assert!(error.starts_with("잘못된 정규식: "), "{error}");
        assert!(!error.contains('\n'));
        assert_eq!(
            Matcher::new(r"\w{1000}{1000}", &options(true, false, false))
                .err()
                .unwrap(),
            "정규식이 너무 복잡합니다."
        );
        assert!(Matcher::new("", &SearchOptions::default()).is_err());
        assert!(Matcher::new(&"a".repeat(513), &SearchOptions::default()).is_err());
        let many = SearchOptions {
            include: vec!["*.md"; 33].join(","),
            ..SearchOptions::default()
        };
        assert!(Matcher::new("a", &many).is_err());
    }

    #[test]
    fn include_and_exclude_globs() {
        let matcher = Matcher::new(
            "a",
            &SearchOptions {
                include: "*.md, docs/**/*.txt".into(),
                exclude: "drafts, docs/old/**".into(),
                ..SearchOptions::default()
            },
        )
        .unwrap();
        for (path, expected) in [
            ("a.md", true),
            ("notes/deep/B.MD", true),
            ("a.mdx", false),
            ("docs/x.txt", true),
            ("docs/sub/x.txt", true),
            ("other/docs/x.txt", false),
            ("drafts/a.md", false),
            ("notes/drafts/a.md", false),
            ("notes/drafts.md", true),
            ("docs/old/a.md", false),
            ("한글 폴더/메모.md", true),
        ] {
            assert_eq!(matcher.includes(path), expected, "{path}");
        }
        let question = Matcher::new(
            "a",
            &SearchOptions {
                include: "note?.md".into(),
                ..SearchOptions::default()
            },
        )
        .unwrap();
        assert!(question.includes("x/note1.md"));
        assert!(!question.includes("note12.md"));
        assert!(
            Matcher::new("a", &SearchOptions::default())
                .unwrap()
                .includes("any/path")
        );
    }

    #[test]
    fn replace_expands_groups_only_in_regex_mode_and_respects_the_limit() {
        let literal = Matcher::new("(a)", &SearchOptions::default()).unwrap();
        assert_eq!(
            literal.replace("(a) a", "$1", 100),
            Some(("$1 a".into(), 1))
        );
        let regex = Matcher::new(r"(\w+)@(\w+)", &options(true, false, false)).unwrap();
        assert_eq!(
            regex.replace("me@host you@there", "${2}:$1 $$", 100),
            Some(("host:me $ there:you $".into(), 2))
        );
        let empty = Matcher::new("x*", &options(true, false, false)).unwrap();
        assert_eq!(empty.replace("axb", "-", 100), Some(("a-b".into(), 1)));
        let growing = Matcher::new("a", &options(true, false, false)).unwrap();
        assert_eq!(growing.replace(&"a".repeat(10), "$0$0$0", 20), None);
        assert_eq!(
            growing.replace("aaaa", "$0$0", 100),
            Some(("aaaaaaaa".into(), 4))
        );
    }
}
