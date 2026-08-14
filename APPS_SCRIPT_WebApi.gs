/**
 * Seiko V2 web-app bridge.
 * Create this as WebApi.gs in the existing Apps Script project.
 * Set Script Property SEIKO_WEB_API_KEY before deploying the web app.
 */
function doPost(e) {
  var started = Date.now();
  try {
    var request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    seikoWebApiAuthorize_(request.apiKey);
    var data = seikoWebApiDispatch_(String(request.action || ''), request.payload || {});
    return seikoWebApiJson_({ ok: true, data: data, durationMs: Date.now() - started });
  } catch (error) {
    return seikoWebApiJson_({
      ok: false,
      code: error && error.code ? error.code : 'WEB_API_ERROR',
      message: error && error.message ? error.message : 'The operation failed.',
      durationMs: Date.now() - started
    });
  }
}

function seikoWebApiAuthorize_(suppliedKey) {
  var expected = PropertiesService.getScriptProperties().getProperty('SEIKO_WEB_API_KEY');
  if (!expected || !suppliedKey || String(expected) !== String(suppliedKey)) {
    var error = new Error('Unauthorized request.');
    error.code = 'UNAUTHORIZED';
    throw error;
  }
}

function seikoWebApiDispatch_(action, payload) {
  var routes = {
    labelBootstrap: function () { return seikoWebApiUnwrap_(seikoGetLabelCenterBootstrap()); },
    labelRecords: function () { return seikoWebApiUnwrap_(seikoGetOrderLabelRecords(payload.orderId)); },
    scannerBootstrap: function () { return seikoWebApiUnwrap_(seikoGetScannerBootstrap()); },
    recordScan: function () { return seikoWebApiUnwrap_(seikoSubmitCenterScan(payload)); },
    traceEntity: function () { return seikoWebApiTraceEntity_(payload.token); }
  };
  if (!routes[action]) {
    var error = new Error('Unsupported operation.');
    error.code = 'UNSUPPORTED_ACTION';
    throw error;
  }
  return routes[action]();
}

function seikoWebApiUnwrap_(result) {
  if (!result || result.ok !== true) {
    var error = new Error((result && result.message) || 'The operation failed.');
    error.code = (result && result.code) || 'OPERATION_FAILED';
    throw error;
  }
  return result.data;
}

function seikoWebApiTraceEntity_(token) {
  token = String(token || '').trim();
  if (!token) return null;
  var entities = SeikoV2.Database.readTable('trace_entities');
  var entity = entities.filter(function (row) { return String(row.token) === token; })[0];
  if (!entity) return null;
  var events = SeikoV2.Database.readTable('trace_events')
    .filter(function (row) { return String(row.entity_id) === String(entity.entity_id); })
    .sort(function (a, b) { return String(b.occurred_at || b.created_at).localeCompare(String(a.occurred_at || a.created_at)); })
    .slice(0, 100);
  return { entity: entity, events: events };
}

function seikoWebApiJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

