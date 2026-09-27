#!/usr/bin/env node
// .ami 插件打包工具：把插件目录打成 .ami（zip 改后缀）
// 用法：node scripts/pack-ami.js <插件目录> [输出文件.ami]
// 插件目录必须包含 manifest.json 和 plugin.cjs（见 docs/PLUGIN_DEVELOPMENT.md「打包与导入」）
const fs = require('fs');
const path = require('path');
const AdmZip = require(path.join(__dirname, '../node_modules/adm-zip'));

function main() {
  const [dirArg, outArg] = process.argv.slice(2);
  if (!dirArg) {
    console.error('用法：node scripts/pack-ami.js <插件目录> [输出文件.ami]');
    process.exit(1);
  }
  const dir = path.resolve(dirArg);
  const manifestPath = path.join(dir, 'manifest.json');
  const entryPath = path.join(dir, 'plugin.cjs');
  if (!fs.existsSync(manifestPath)) { console.error('缺少 manifest.json'); process.exit(1); }
  if (!fs.existsSync(entryPath)) { console.error('缺少 plugin.cjs'); process.exit(1); }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const out = path.resolve(outArg || path.join(process.cwd(), `${manifest.id}.ami`));

  const zip = new AdmZip();
  zip.addLocalFile(manifestPath, '', 'manifest.json');
  zip.addLocalFile(entryPath, '', 'plugin.cjs');
  // 附加资源（排除入口与清单本身）
  for (const name of fs.readdirSync(dir)) {
    if (name === 'manifest.json' || name === 'plugin.cjs') continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isFile()) {
      zip.addLocalFile(full, '', name);
    } else {
      zip.addLocalFolder(full, name);
    }
  }
  zip.writeZip(out);
  console.log(`打包完成：${out}（${(fs.statSync(out).size / 1024).toFixed(1)} KB）`);
}

main();
