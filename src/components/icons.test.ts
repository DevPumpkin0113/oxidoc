import sprite from "@vscode/codicons/dist/codicon.svg?raw";
import { expect, it } from "vitest";
import { spriteIcons } from "./icons";

it("스프라이트로 그리는 아이콘 이름이 번들된 Codicons 스프라이트에 모두 있음", () => {
  const missing = Object.values(spriteIcons).filter(
    (id) => !sprite.includes(`id="${id}"`),
  );
  expect(missing).toEqual([]);
});
