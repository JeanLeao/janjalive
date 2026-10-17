import { startCampaign } from './campaign.mjs';
export default async function () {
  const dir = process.env.F20_OUTPUT || '/tmp/screen-f20-results';
  const manifest = await startCampaign(dir);
  process.env.F20_CAMPAIGN_ID = manifest.campaignId;
}
