import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server';
import { createServerEntry } from '@tanstack/react-start/server-entry';
import { handleWebHealth } from './health';

const fetchHandler = createStartHandler(defaultStreamHandler);

export default createServerEntry({
  fetch: (request: Request) => {
    const healthResponse = handleWebHealth(request);
    if (healthResponse) return healthResponse;
    return fetchHandler(request);
  },
});
