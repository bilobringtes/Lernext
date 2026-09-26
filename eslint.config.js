module.exports = [
  {
    files: ["app.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        performance: "readonly",
        confirm: "readonly",
        alert: "readonly",
        prompt: "readonly",
        location: "readonly",
        Storage: "readonly",
        DOMException: "readonly",
        AudioContext: "readonly",
        webkitAudioContext: "readonly"
      }
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "error"
    }
  },
  {
    files: ["sw.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        self: "readonly",
        caches: "readonly",
        fetch: "readonly"
      }
    }
  }
];
