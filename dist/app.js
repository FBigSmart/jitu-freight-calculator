(() => {
  "use strict";

  if (typeof document === "undefined") {
    module.exports = require("./app-core.js");
    return;
  }

  const styles = document.createElement("link");
  styles.rel = "stylesheet";
  styles.href = "./courier.css";
  document.head.appendChild(styles);

  const core = document.createElement("script");
  core.src = "./app-core.js";
  document.body.appendChild(core);
})();
