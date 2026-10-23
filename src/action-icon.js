// The toolbar icon is the same bookmark mark as the favicon, filled with the accent.
(function () {
  const MARK_PATH = "M3.6 1.5h8.8A1.1 1.1 0 0 1 13.5 2.6V14.5L8 11.2 2.5 14.5V2.6A1.1 1.1 0 0 1 3.6 1.5z";
  const SIZES = [16, 32, 48, 128];
  const STORAGE_KEY = "bookmarks.actionIcon";
  const DEFAULT_FILL = "#a8c7fa";

  function imageDataFor(fill) {
    const imageData = {};
    for (const size of SIZES) {
      const canvas = new OffscreenCanvas(size, size);
      const context = canvas.getContext("2d", { alpha: true });
      context.setTransform(size / 16, 0, 0, size / 16, 0, 0);
      context.fillStyle = fill;
      context.fill(new Path2D(MARK_PATH));
      imageData[size] = context.getImageData(0, 0, size, size);
    }
    return imageData;
  }

  async function paint(fill) {
    if (!fill || !globalThis.chrome?.action?.setIcon) return;
    await chrome.action.setIcon({ imageData: imageDataFor(fill) });
  }

  globalThis.__bookmarksActionIcon = { paint, imageDataFor, STORAGE_KEY, DEFAULT_FILL };
})();
