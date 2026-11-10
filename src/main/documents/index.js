'use strict';
const { renderStatement, statementFileName } = require('./statement');
const { renderSettlement, settlementFileName } = require('./settlement');
const { today } = require('../core/dates');

/**
 * Build a printable document from a request.
 *
 * @param {object} services
 * @param {{ type: 'statement', key: string, vehicle?: string, from?: string, to?: string }
 *        | { type: 'settlement', id: number }} request
 * @returns {{ html: string, fileName: string }}
 */
function buildDocument(services, request) {
  const settings = services.settings.get();
  const generatedOn = today();
  if (request?.type === 'settlement') {
    const settlement = services.payments.getSettlement(request.id);
    return { html: renderSettlement(settlement, settings, generatedOn), fileName: settlementFileName(settlement) };
  }
  const account = services.accounts.get(request?.key, {
    vehicle: request?.vehicle || '',
    from: request?.from || '',
    to: request?.to || '',
  });
  return { html: renderStatement(account, settings, generatedOn), fileName: statementFileName(account, generatedOn) };
}

module.exports = { buildDocument };
