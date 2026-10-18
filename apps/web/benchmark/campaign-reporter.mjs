import { rounds, finishCampaign } from './campaign.mjs';

export default class CampaignReporter {
  results = [];
  onTestEnd(test, result) { this.results.push({ title: test.title, status: result.status }); }
  async onEnd(result) {
    const expected = rounds.map(r => `${r.scenario} round ${r.repetition}`).sort();
    const actual = this.results.map(r => r.title).sort();
    if (result.status !== 'passed' || this.results.some(r => r.status !== 'passed') || JSON.stringify(actual) !== JSON.stringify(expected)) {
      console.error('F20 campaign incomplete: exactly nine unique successful rounds are required.');
      return;
    }
    try {
      await finishCampaign(process.env.F20_OUTPUT || '/tmp/screen-f20-results');
    } catch (error) {
      console.error(`F20 campaign integrity failed: ${error.message.split('\n')[0]}`);
      return { status: 'failed' };
    }
  }
}
