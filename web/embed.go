package web

import "embed"

// FS 将无构建步骤的前端资源打包进可执行文件。
//
//go:embed index.html app.css app.js
var FS embed.FS
