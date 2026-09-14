/**
 * MetaMask (and similar wallet extensions) inject into every page and can throw
 * "Failed to connect to MetaMask" while restoring sessions. This app has no
 * wallet/web3 code — suppress that extension noise so Next.js doesn't surface it.
 *
 * Next.js registers its own unhandledrejection listener and does not honor
 * preventDefault alone, so we wrap addEventListener early and drop noise
 * before the overlay handler runs.
 */
export const suppressExtensionNoiseScript = `(function () {
  try {
    function isNoise(v) {
      var s = "";
      if (typeof v === "string") s = v;
      else if (v && typeof v === "object") {
        s = [v.message, v.stack, v.reason && v.reason.message]
          .filter(Boolean)
          .join(" ");
      } else if (v != null) s = String(v);
      return /metamask|failed to connect to metamask|extension not found|chrome-extension:\\/\\/nkbihfbeogaeaoehlefnkodbefgpgknn/i.test(
        s
      );
    }

    function wrap(listener) {
      if (typeof listener !== "function") return listener;
      return function (event) {
        var reason =
          event && (event.reason !== undefined ? event.reason : event.error);
        if (isNoise(reason) || isNoise(event)) {
          if (event && typeof event.preventDefault === "function") {
            event.preventDefault();
          }
          return;
        }
        return listener.apply(this, arguments);
      };
    }

    var origAdd = window.addEventListener;
    window.addEventListener = function (type, listener, options) {
      if (type === "unhandledrejection" || type === "error") {
        listener = wrap(listener);
      }
      return origAdd.call(this, type, listener, options);
    };

    window.addEventListener("unhandledrejection", function (e) {
      if (isNoise(e.reason)) e.preventDefault();
    });
    window.addEventListener("error", function (e) {
      if (isNoise(e.error) || isNoise(e.message)) {
        e.preventDefault();
        return true;
      }
    });

    var origError = console.error;
    console.error = function () {
      for (var i = 0; i < arguments.length; i++) {
        if (isNoise(arguments[i])) return;
      }
      return origError.apply(console, arguments);
    };
  } catch (e) {}
})();`
