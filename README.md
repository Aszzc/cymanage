# 册管家

Astro + Cloudflare Pages + D1 的宣传册库存登记系统。

部署由 `main` 分支的每次提交自动触发。

## 部署到 Cloudflare Pages

1. 在 Cloudflare D1 创建数据库 `brochure-ledger`，将数据库 ID 填入 `wrangler.toml`。
2. 执行 `npx wrangler d1 migrations apply brochure-ledger --remote` 初始化表与示例数据。
3. 将仓库连接到 Cloudflare Pages；构建命令填 `npm run build`，输出目录填 `dist`。
4. 在 Pages 项目的 **Settings → Bindings → D1 database bindings** 中新增绑定，变量名必须为 `DB`，并选择刚建立的数据库。

本项目使用 Astro 的 Cloudflare 适配器，由 Pages 承载服务端路由与 D1 访问，未单独创建或维护 Worker。
