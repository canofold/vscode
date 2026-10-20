# Canofold Markdown Preview for VS Code

[English](README.md)

使用 [`@canofold/markdown`](https://www.npmjs.com/package/@canofold/markdown)，在当前编辑器标签页预览已保存的 `.md` 文件。

## 安装与使用

需要 VS Code 1.100 或更新版本。从 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=canofold.canofold-vscode) 安装发布者为 `canofold` 的 **Canofold Markdown Preview**。

打开已保存的 `.md` 文件，点击编辑器右上角的 Canofold 图标，或运行 **Canofold: Toggle Canofold Preview**。同一命令可在当前标签页切换源码和预览。`SKILL.md`、`*.instructions.md` 等 Markdown 文件无需改变编辑器语言即可使用。

如果当前编辑器配置隐藏了图标，可打开标题栏的 `...` 菜单，检查 **Configure Icon Visibility**。

命令面板还提供两个单向命令：**Canofold: Preview with Canofold** 打开预览，**Canofold: Edit Markdown Source** 返回源码。

切到预览时会先保存尚未保存的源码；预览打开后，文档中的未保存修改也会实时更新。相对图片与链接按 Markdown 文件位置解析，链接通过 VS Code 打开。预览使用 Canofold 浅色外观，不跟随编辑器主题。原始 HTML 会被清理，不执行 MDX 代码或 Skill 指令。

## 项目文档检查

在本地工作区的文件中运行 **Canofold: Check Project**，检查最近的、在 `dependencies` 或 `devDependencies` 中声明 `canofold` 的项目。请先通过项目正常的依赖管理流程安装 Canofold。命令调用项目已安装的 `canofold check --json`，不自动安装、不回退到全局 CLI，也不重复实现 Core 的检查规则。

检查要求工作区已受信任，且扩展宿主的 Node.js 运行时至少为 22.12；预览不依赖项目检查。检查只读取磁盘文件：请先保存或放弃该项目的未保存修改，命令不会代为保存。结果展示在 **Problems** 面板，只在 CLI 提供源码位置时定位；项目级问题和 OpenAPI pointer 会明确标注没有精确源码位置。

可通过进度通知取消检查。编辑项目文件会清除过时结果，保存后需重新运行检查；连续执行会替换旧任务，不同项目各自保留结果。这是显式的项目检查，不会在每次输入时自动校验全站。

## 渲染能力与边界

未知或无效的富文本指令会显示为不可执行的源码，保留周围正常内容。`format:check` 等普通冒号文本保持原样。这种容错不忽略插件故障，也不放宽 HTML 和本地资源的安全边界。

支持数学公式、Mermaid、PlantUML、Graphviz/DOT 和 D2 图表。图表完全在本机渲染，源码不发送到公共渲染服务。Mermaid 与 PlantUML 在隔离的预览 Webview 中运行；Graphviz 和 D2 在每个预览独立持有的 Node.js Worker 中生成 SVG。更新或关闭预览会取消过时任务并释放 Worker。

本地 HTML iframe 只展示静态内容，不允许脚本或同源访问。相对 CSS、图片、字体和 CSS imports 会打包进嵌入文档；资源限制在工作区及其 public 目录中，不跟随符号链接。单文件上限为 2 MiB，最多加载 64 个本地资源，合计资源或生成内容上限为 16 MiB。缺失资源会显示警告，但不丢弃剩余内容。远程 iframe 要求 HTTPS，并受目标网站的嵌入策略限制。

扩展是已保存 `.md` 文件的可选编辑器，不替换 VS Code 默认 Markdown 编辑器。它不构建站点导航、搜索索引或 AI 输出，也不安装或执行 Agent Skills。建站与 SDK 使用方式见 [Canofold 文档](https://canofold.dev/)。

## 开发

需要 Node.js 22.12+、pnpm 和 VS Code 1.100+。

```sh
pnpm install --frozen-lockfile
pnpm build
```

在 VS Code 中打开本仓库并按 `F5`，启动 Extension Development Host。在测试窗口打开 `.md` 文件，再运行 **Canofold: Toggle Canofold Preview**。

验证后生成本地 VSIX：

```sh
pnpm package
```

要在隔离的真实 VS Code 窗口运行插件与 iframe 测试，将 `VSCODE_EXECUTABLE` 指向应用程序可执行文件，而不是 `code` CLI，再运行 `pnpm test:editor`。macOS 示例：

```sh
VSCODE_EXECUTABLE='/Applications/Visual Studio Code.app/Contents/MacOS/Code' pnpm test:editor
```

测试覆盖首次加载、未保存编辑、失败恢复、关闭重开，以及指令容错、数学和 iframe 资源与权限边界。验证本地 Core 构建时，可追加 `--plugins-package /absolute/path/to/packages/plugins` 和／或 `--markdown-package /absolute/path/to/packages/markdown`；测试会创建隔离消费者，不改动已安装依赖。正式发布验收必须省略这两个选项，使用已发布的依赖。

要包含真实已安装 Canofold CLI 的检查验收，可追加 `--check-project /absolute/path/to/consumer`。VS Code 提示时，仅信任本轮临时测试工作区；测试不会关闭 Workspace Trust。等待人工确认不计入 CLI 执行超时；关闭测试窗口即可取消本轮验收。

## 许可证

MIT
