use base64::{Engine, engine::general_purpose::STANDARD};
use minisign_verify::{PublicKey, Signature};

#[test]
fn pinned_updater_key_accepts_signed_fixture_and_rejects_modified_bytes() {
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let key = config["plugins"]["updater"]["pubkey"].as_str().unwrap();
    let decoded_key = String::from_utf8(STANDARD.decode(key).unwrap()).unwrap();
    let public_key = PublicKey::decode(&decoded_key).unwrap();
    let encoded_signature = include_str!("../tests/fixtures/update-payload.txt.sig").trim();
    let decoded_signature = String::from_utf8(STANDARD.decode(encoded_signature).unwrap()).unwrap();
    let signature = Signature::decode(&decoded_signature).unwrap();
    let payload = include_bytes!("../tests/fixtures/update-payload.txt");
    assert!(public_key.verify(payload, &signature, true).is_ok());
    assert!(
        public_key
            .verify(b"modified installer", &signature, true)
            .is_err()
    );
    assert!(
        signature
            .trusted_comment()
            .split('\t')
            .any(|field| field == "version:0.3.0")
    );
    assert_eq!(config["plugins"]["updater"]["requireSignedVersion"], true);
}
