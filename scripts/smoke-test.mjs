/**
 * Read-only smoke test: talks to the running headroom proxy through the same
 * code path the plugin uses. It never writes proxy.json / cordis.patch.yml.
 *
 *   node scripts/smoke-test.mjs
 */
import { __test } from '../lib/index.js'

const status = await __test.statusPayload()
const proxy = status.proxy
console.log('[headroom] running =', proxy.running, '| version =', proxy.version, '| port =', proxy.port)
console.log('[headroom] installed versions =', JSON.stringify(proxy.installedVersions))
if (proxy.versionWarning) console.log('[WARN]', proxy.versionWarning)
console.log('[route]', status.route.mode, '| inferenceOrigin =', status.route.inferenceOrigin && status.route.inferenceOrigin.value)
console.log('[stats] requests =', status.stats && status.stats.apiRequests,
  '| removed tokens =', status.stats && status.stats.tokensRemoved,
  '| lifetime saved =', status.stats && status.stats.lifetime && status.stats.lifetime.tokensSaved)
console.log('[paths]', JSON.stringify(status.paths, null, 2))

if (!proxy.running) {
  console.error('[FAIL] headroom proxy is not running')
  process.exitCode = 1
}
