# 册管家

Astro 静态前端 + Cloudflare Pages Functions + D1 的宣传册库存登记系统。

部署由 `main` 分支的每次提交自动触发。

## Cloudflare Pages 设置

1. 构建命令：`npm run build`
2. 输出目录：`dist`
3. D1 绑定名：`DB`，数据库：`cymanage`
4. R2 绑定名：`COVERS`，存储桶：`cymanage-covers`

两项绑定均已声明在 `wrangler.toml`，首次部署前需要确保对应 D1 数据库和 R2 存储桶已经创建。

## 初始化 D1 数据库

如果本机已经登录 Wrangler，可以在项目目录执行：

```bash
npx wrangler d1 migrations apply cymanage --remote
```

也可以在 Cloudflare 后台打开 D1 数据库 `cymanage`，进入 Console，把 `migrations/0001_initial.sql` 的内容粘贴执行。

项目没有单独创建或维护 Workers 项目。动态接口使用 Cloudflare Pages 自带的 Functions，通过 `DB` 访问 D1、通过 `COVERS` 保存封面。

## 本地验证

```bash
npm run check
npx wrangler pages dev dist
npm run test:smoke
```
