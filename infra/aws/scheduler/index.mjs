const allowedEndpoints = new Set([
  '/api/cron/send-scheduled',
  '/api/cron/check-followups',
  '/api/cron/sync-gmail',
]);

export const handler = async (event = {}) => {
  const appUrl = process.env.APP_URL?.replace(/\/$/, '');
  const cronSecret = process.env.CRON_SECRET;
  const endpoint = event.endpoint;

  if (!appUrl || !cronSecret) {
    throw new Error('APP_URL and CRON_SECRET must be configured');
  }
  if (!allowedEndpoints.has(endpoint)) {
    throw new Error(`Unsupported worker endpoint: ${endpoint || '(missing)'}`);
  }

  const response = await fetch(`${appUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cronSecret}`,
      'content-type': 'application/json',
      'user-agent': 'maildesk-aws-scheduler/1.0',
    },
    body: '{}',
    signal: AbortSignal.timeout(55_000),
  });

  const responseText = await response.text();
  console.log(JSON.stringify({ endpoint, status: response.status, response: responseText }));

  if (!response.ok) {
    throw new Error(`${endpoint} returned HTTP ${response.status}: ${responseText}`);
  }

  return { endpoint, statusCode: response.status };
};
