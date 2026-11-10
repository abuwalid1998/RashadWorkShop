'use strict';
const { BrowserWindow } = require('electron');

const FOOTER = `
  <div style="width:100%; font-size:8px; color:#8e8e93; text-align:center; font-family:sans-serif;">
    <span class="pageNumber"></span> / <span class="totalPages"></span>
  </div>`;

/** Load a published document in an invisible window, ready to print. */
async function loadDocument(url) {
  const window = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: true },
  });
  await window.loadURL(url);
  // Wait for the bundled fonts, otherwise the PDF captures fallback glyphs.
  await window.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
  return window;
}

/** Chromium lays out Arabic correctly, so the PDF is the page itself. */
async function renderPdf(url) {
  const window = await loadDocument(url);
  try {
    return await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: FOOTER,
    });
  } finally {
    window.destroy();
  }
}

/** Open the system print dialog for a document. */
async function printDocument(url) {
  const window = await loadDocument(url);
  return new Promise((resolve) => {
    window.webContents.print({ printBackground: true }, (success, reason) => {
      window.destroy();
      resolve({ printed: success, reason: success ? '' : reason });
    });
  });
}

module.exports = { renderPdf, printDocument };
