# 册管家

Astro + Cloudflare Pages + D1 的宣传册库存登记系统。

部署由 `main` 分支的每次提交自动触发。

## Cloudflare Pages 设置

1. Pages 构建命令：`npm run build`
2. Pages 输出目录：`dist`
3. 在 Pages 项目的 Bindings 里添加 D1 数据库绑定
4. 绑定变量名：`DB`
5. D1 数据库：选择 `cymanage`

## 初始化 D1 数据库

如果你本机已经登录 Wrangler，可以在项目目录执行：

```bash
npx wrangler d1 migrations apply cymanage --remote
```

也可以在 Cloudflare 后台打开 D1 数据库 `cymanage`，进入 Console，把 `migrations/0001_initial.sql` 的内容粘贴执行。

`wrangler.toml` 不提交 D1 的 `database_id`，运行时以 Cloudflare Pages 后台的 `DB` 绑定为准。

本项目使用 Astro 的 Cloudflare 适配器，由 Cloudflare Pages 承载服务端路由与 D1 访问，没有单独创建或维护 Worker 项目。
