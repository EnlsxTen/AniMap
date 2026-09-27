import path from 'path';
import dotenv from 'dotenv';

// 必须在导入任何使用 process.env 的模块（如 r2Client，它在加载时即读取 R2_* 创建 S3Client）之前加载 .env。
// 用 require 而非顶部 import，避免 ES import 提升导致 r2Client 先于 dotenv 执行、读到空凭证。
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { reconcileUploadsToR2 } = require('../utils/reconcileR2') as typeof import('../utils/reconcileR2');

async function main() {
  const force = process.env.FORCE_RECONCILE === '1';
  console.log(`[reconcileR2] 开始扫描本地 uploads 并补全 R2${force ? '（强制覆盖）' : ''}...`);
  const result = await reconcileUploadsToR2({ force, verbose: true });
  console.log(JSON.stringify({
    scanned: result.scanned,
    reconciled: result.reconciled,
    uploadedVariants: result.uploaded,
    skipped: result.skipped,
    failed: result.failed,
  }, null, 2));
  if (result.failed > 0) {
    console.log('失败文件:', result.details.filter(d => d.status === 'failed'));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
