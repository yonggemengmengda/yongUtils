# YongUtils

![VS Code Version](https://img.shields.io/visual-studio-marketplace/v/yonggemengmengda.yongutils)
![Downloads](https://img.shields.io/visual-studio-marketplace/d/yonggemengmengda.yongutils)
![Rating](https://img.shields.io/visual-studio-marketplace/r/yonggemengmengda.yongutils)

YongUtils 是一个面向前端开发者的 VS Code 效率插件，聚焦 import 整理、AI 翻译、Git Commit 生成、i18n 提取、类型生成、AST 洞察和常用开发工具。

如果你经常在项目里处理中文文案、命名、提交信息、Vue 3 文件结构或杂项开发工具，YongUtils 可以把这些高频动作收拢到同一个工作流里。

## 功能概览

### 1. 智能 Import 排序

- 支持 JavaScript / TypeScript / JSX / TSX / Vue SFC
- 支持副作用 import 置顶、`import type`、未使用导入清理
- 支持读取 `tsconfig/jsconfig` 的 alias 规则
- 支持右键命令、Code Action 和保存时自动整理

详细说明见 [IMPORT_SORTING_README.md](./IMPORT_SORTING_README.md)。

### 2. AI 翻译与英文命名

- 支持选中英汉互译
- 支持选中文本生成英文命名
- 支持鼠标悬浮自动翻译
- 自带翻译缓存，减少重复请求
- 缺少 AI 配置时会自动提示跳转到配置页

### 3. AI 生成 Git Commit 评论

- 在 VS Code 源代码管理中可直接触发生成
- 支持 SCM 标题栏入口、`暂存区 / 更改区` 行内入口
- 自动读取当前仓库改动生成 commit 评论
- 当暂存区和更改区同时有内容时，默认只基于暂存区生成
- 生成结果会静默写入 Git 提交输入框，仅在失败时提示

### 4. Git Commit 配置页

- 独立页面管理提交规范
- 支持自定义生成规范、补充提示词、细节摘要提示词
- 支持纯文本或带 Emoji 的提交格式
- 支持 `标题` 或 `标题 + 摘要`
- 自动读取项目根目录的 commitlint 配置并生成推荐预设

### 5. AI 基础配置页

- 独立管理 `API Key`、`Base URL`、模型和 AI 服务预设
- 当前翻译和 Git Commit 共用这套 AI 连接配置
- 内置 OpenAI、通义千问、DeepSeek、SiliconFlow 等预设
- 兼容自定义 OpenAI 风格接口

### 6. 翻译管理页

- 单独管理翻译系统提示词
- 单独管理通用翻译模板、英文命名模板
- 查看、过滤、复制、删除翻译缓存

### 7. i18n 文案提取

- 将中文文案快速提取为 i18n key
- 自动生成英文 key 名和英文翻译
- 支持常见 `t()` / `$t()` 替换片段
- 自动生成可复制的语言包条目

### 8. TypeScript 类型生成

- 选中对象、数组或表达式，快速生成 TypeScript 类型
- 支持复杂嵌套结构
- 适合接口 mock、配置对象、响应数据快速建模

### 9. 工具面板

内置可视化工具页，当前包含：

- AI 基础配置
- AST 解析
- JSON 序列化
- Base64 / MD5
- JS 转 TS
- 正则表达式测试
- 图片尺寸与格式调整
- 翻译管理
- Git Commit 配置

### 10. 其他常用命令

- 添加英文文件
- URI 编解码
- 调试日志快捷插入

## 快速开始

### 安装

#### 方式一：扩展市场

1. 打开 VS Code
2. 进入扩展商店
3. 搜索 `YongUtils`
4. 点击安装

#### 方式二：安装 VSIX

1. 在 VS Code 中执行 `Extensions: Install from VSIX`
2. 选择打包好的 `.vsix` 文件

### AI 功能首次配置

1. 执行命令 `打开 YongUtils 工具面板`
2. 进入 `AI基础配置`
3. 选择预设或填写 `API Key`、`Base URL`、`模型`
4. 保存后即可用于翻译、命名和 Git Commit 生成

补充说明：

- 翻译系统提示词和翻译模板在 `翻译管理` 页面配置
- Git Commit 规范和摘要策略在 `Git Commit配置` 页面配置
- 如果未完成 AI 配置，使用相关功能时会自动提示前往配置

## 使用说明

### Import 排序

- 编辑器右键执行 `排序Imports`
- 或在命令面板执行相关命令
- 也可以通过配置开启保存时自动整理

推荐配置：

```json
{
  "yongutils.importSorter.sortOnSave": true,
  "yongutils.importSorter.removeUnusedImports": true,
  "yongutils.importSorter.placeSideEffectImportsFirst": true,
  "yongutils.importSorter.internalLibPrefixes": ["@/", "~/"]
}
```

### 翻译

- 选中文本后右键执行 `选中英汉互译`
- 选中文本后右键执行 `翻译选中为英文`
- 快捷键 `Alt + Y` 切换悬浮自动翻译

### Git Commit 生成

在 VS Code 源代码管理中可以通过以下方式触发：

- SCM 顶部标题栏按钮
- `更改 / Changes` 右侧按钮
- `暂存更改 / Index` 右侧按钮

行为说明：

- 会根据当前仓库改动和配置好的生成规范自动生成提交信息
- 如果同时存在暂存区和未暂存改动，优先只根据暂存区生成
- 生成结果会直接静默覆盖提交输入框中的内容
- 只有生成失败时才会弹出提示

### Git Commit 配置

进入工具面板中的 `Git Commit配置`，可配置：

- 主生成规范
- 是否带 Emoji
- 是否追加细节摘要
- 摘要提示词
- 自定义补充提示词

如果项目根目录存在以下文件之一，会自动识别 commitlint 规则并生成推荐预设：

- `.commitlintrc.js`
- `.commitlintrc.cjs`
- `commitlint.config.js`
- `commitlint.config.cjs`
- `.commitlintrc.json`

### AST 解析

适合查看 Vue 3 / HTML / JavaScript / TypeScript 文件结构：

- 浏览 AST 节点
- 查看结构摘要
- 搜索节点
- 点击节点跳转源代码位置

补充说明：

- Vue 深度摘要和组合式 API 洞察主要面向 Vue 3 SFC
- 推荐搭配 `<script setup>` 使用

## 示例

### Git Commit 输出示例

仅标题：

```text
feat: 新增 Git Commit 配置页
```

标题加摘要：

```text
✨ feat: 新增 Git Commit 配置页

- 增加独立配置页管理提交规范和摘要策略
- 支持根据 commitlint 自动生成推荐预设
```

### TypeScript 类型生成示例

输入：

```ts
const user = {
  id: 1,
  name: "张三",
  isActive: true,
  profile: {
    city: "北京"
  }
}
```

输出：

```ts
interface User {
  id: number
  name: string
  isActive: boolean
  profile: {
    city: string
  }
}
```

## 配置项

### Import 排序

- `yongutils.importSorter.addGroupComments`
- `yongutils.importSorter.sortByLength`
- `yongutils.importSorter.sortOnSave`
- `yongutils.importSorter.removeUnusedImports`
- `yongutils.importSorter.placeSideEffectImportsFirst`
- `yongutils.importSorter.internalLibPrefixes`
- `yongutils.importSorter.customGroupNames`

### Git Commit 生成

- `yongutils.gitCommitMessage.generationSpec`
- `yongutils.gitCommitMessage.customPrompt`
- `yongutils.gitCommitMessage.includeEmoji`
- `yongutils.gitCommitMessage.includeDetailSummary`
- `yongutils.gitCommitMessage.detailSummaryPrompt`

说明：

- 这些配置也可以直接在工具面板的 `Git Commit配置` 页面里修改
- UI 页面和 VS Code 配置项是同一份数据

## 安全与隐私

- Import 排序、AST、正则、图片处理、类型生成等能力都在本地执行
- AI 请求只会发送到你自己配置的模型服务
- API Key 使用 VS Code Secret Storage 保存，不会写入项目文件

## 开发

### 环境要求

- Node.js >= 18
- pnpm
- VS Code 1.92+

### 本地开发

```bash
pnpm install
pnpm run compile
```

调试方式：

1. 在 VS Code 中打开项目
2. 按 `F5`
3. 启动新的扩展开发窗口

### 常用命令

```bash
pnpm run compile
pnpm run watch
pnpm run package
pnpm run compile-tests
pnpm run test
pnpm run lint
```

说明：

- `pnpm run compile` 会同时构建扩展本体和 webview 页面

## 文档

- [Import 排序详细说明](./IMPORT_SORTING_README.md)
- [更新日志](./CHANGELOG.md)

## 反馈与贡献

欢迎提交 Issue 和 Pull Request。

- 问题反馈: https://github.com/yonggemengmengda/yongUtils/issues
- 项目地址: https://github.com/yonggemengmengda/yongUtils

YongUtils 旨在把常见但分散的开发动作整合成一套更顺手的日常工作流。
