# ABA关键词监控系统 V1

只基于 `keyword + rank + reportDate` 的 ABA 关键词排名监控后台。

## 本地启动

```powershell
npm install
docker compose up -d
Copy-Item apps/api/.env.example apps/api/.env
npm run dev:api
npm run dev:web
```

默认地址：

- Web: http://localhost:3000
- API: http://localhost:4000/api/health

## 部署

仓库根目录已包含 `render.yaml`，适合在 Render 里使用 Blueprint 部署：

1. 推送到 GitHub 仓库。
2. 在 Render 选择 New Blueprint。
3. 选择该仓库，Render 会创建 Web、API、PostgreSQL、Redis。
4. 部署完成后，把前端服务的 `NEXT_PUBLIC_API_BASE_URL` 指向 API 服务地址。

## 目录

- `apps/web`: Next.js 15 后台界面
- `apps/api`: NestJS API、导入任务、统计规则
- `packages/shared`: 共享类型、规则算法、mock 数据

## V1 原则

第一版只使用：

- `keyword`
- `rank`
- `reportDate`

导入文件里的 `clickShare`、`conversionShare`、`clickedAsin`、`clickedItemName` 会被忽略。
