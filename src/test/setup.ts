import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { useSettings, defaults } from "../settings/store";

beforeEach(() => {
  useSettings.setState(
    {
      ...useSettings.getInitialState(),
      initialized: true,
      settings: { ...defaults, language: "ko" },
    },
    true,
  );
});

afterEach(cleanup);
