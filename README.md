# 册管家

Astro 静态前端 + Cloudflare Pages Functions + D1 的宣传册库存登记系统。

部署由 `main` 分支的每次提交自动触发。

## Cloudflare Pages 设置

1. 构建命令：`npm run build`
2. 输出目录：`dist`
3. D1 绑定名：`DB`，数据库：`cymanage`
封面会在浏览器压缩后直接保存到 D1，不需要开通或绑定 R2。

## 初始化 D1 数据库

如果本机已经登录 Wrangler，可以在项目目录执行：

```bash
npx wrangler d1 migrations apply cymanage --remote
```

也可以在 Cloudflare 后台打开 D1 数据库 `cymanage`，进入 Console，把 `migrations/0001_initial.sql` 的内容粘贴执行。

项目没有单独创建或维护 Workers 项目。动态接口使用 Cloudflare Pages 自带的 Functions，通过 `DB` 访问 D1；库存、记录和压缩后的封面均保存在 D1。

## 本地验证

```bash
npm run check
npx wrangler pages dev dist
npm run test:smoke
```
