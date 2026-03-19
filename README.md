# YongUtils - VS Code 开发效率工具集

![VS Code Version](https://img.shields.io/visual-studio-marketplace/v/yonggemengmengda.yongutils)
![Downloads](https://img.shields.io/visual-studio-marketplace/d/yonggemengmengda.yongutils)
![Rating](https://img.shields.io/visual-studio-marketplace/r/yonggemengmengda.yongutils)

YongUtils 是一款专为前端开发者打造的 VS Code 插件工具集，集成了多种实用功能，旨在提升日常开发效率。无论是代码整理、翻译、类型生成还是常用工具操作，YongUtils 都能为你提供便捷的解决方案。

## 🌟 核心功能

### 1. 智能 Import 排序
自动对 JavaScript/TypeScript/Vue 文件中的 import 语句进行智能排序和分组：
- 按照预设规则对 import 进行分类（Node.js 内置模块、第三方库、项目内部模块）
- 支持注释分组和长度排序
- 保持代码整洁，提高可读性

**使用方式**：右键编辑器 → "Sort Imports" 或使用快捷键

### 2. AI 智能翻译
集成 OpenAI API，实现高质量的中英文互译：
- 支持选中内容翻译
- 支持整文件翻译
- 自动缓存翻译结果，避免重复请求
- 支持自定义翻译配置

**使用方式**：
- 选中文本 → 右键 → "选中英汉互译"
- 快捷键 `Alt + Y` 切换翻译

### 3. 鼠标悬浮自动翻译（Hover Translation）
**智能悬浮翻译**：当鼠标悬停在代码中的中文或英文单词上时，自动显示对应的翻译结果！

**功能特点**：
- **实时翻译**：无需选中文字，只需将鼠标悬停在单词上即可看到翻译
- **智能识别**：自动识别中英文单词，忽略数字、符号等非文本内容
- **缓存优化**：已翻译的内容会自动缓存，下次悬停时秒级响应
- **全局支持**：支持所有编程语言文件（JavaScript、TypeScript、Vue、Python、Java 等）

**使用方式**：
1. **开启功能**：按 `Ctrl+Shift+P` → 输入 "AI自动翻译开关" → 回车开启
2. **使用翻译**：在任意文件中将鼠标悬停在中英文单词上
3. **关闭功能**：再次执行 "AI自动翻译开关" 命令即可关闭

**配置选项**：
```json
{
  // 控制悬浮翻译功能的开关状态（默认开启）
  "yongutils.hoverTranslationEnabled": true
}
```

### 4. TypeScript 类型生成
将 JavaScript 对象自动解析并生成对应的 TypeScript 类型定义：
- 智能推断数据类型
- 支持复杂嵌套对象
- 一键生成 interface 或 type 定义

**使用方式**：选中 JS 对象 → 右键 → "解析为 TS 类型"

### 5. 国际化文件管理
快速为当前文件创建对应的英文版本：
- 自动识别文件命名规范（如 `zh.js` → `en.js`）
- 保持原有文件结构
- 提升国际化开发效率

**使用方式**：资源管理器右键文件 → "添加英文文件"

### 6. Webview 多功能工具面板
内置图形化界面，提供多种实用工具：

#### 🔍 AST 代码解析预览
**实时 AST 分析**：深度解析 Vue/HTML/JavaScript/TypeScript 文件的抽象语法树！

**功能特性**：
- **多语言支持**：Vue (.vue)、HTML (.html)、JavaScript (.js/.jsx)、TypeScript (.ts/.tsx)
- **智能摘要**：自动生成结构摘要，包括导入模块、函数、变量、类等关键信息
- **交互式浏览**：点击 AST 节点可直接跳转到源代码对应位置
- **高级搜索**：
  - 支持正则表达式搜索（如 `/function/`）
  - 支持多关键词空格分隔搜索（需全部匹配）
  - 实时高亮匹配节点
- **结构洞察**：针对 Vue 文件提供模板组件、脚本结构、样式分析等专门视图

**使用场景**：
- 代码审查时快速了解文件结构
- 调试复杂逻辑时查看 AST 层级关系
- 学习框架源码时分析语法结构

#### 📝 正则表达式测试
**全能正则表达式工具**：提供实时测试和丰富的速查表！

**功能特性**：
- **实时匹配测试**：输入正则表达式和测试文本，立即显示匹配结果
- **标志支持**：支持 `g`（全局）、`i`（忽略大小写）、`gi`（全局+忽略大小写）等标志
- **结果展示**：以 JSON 格式清晰展示匹配结果，包括捕获组信息
- **速查表大全**：内置 100+ 常用正则表达式，涵盖以下类别：
  - **基础语法**：字符匹配、分组引用、锚点边界、数量匹配、预查断言
  - **数据校验**：数字、日期、时间、邮箱、手机号、身份证、车牌号等
  - **网络相关**：域名、URL、IP地址、MAC地址、端口号等
  - **安全相关**：密码强度、SQL注入检测、文件路径等
- **智能搜索**：速查表支持关键字搜索，快速定位所需表达式
- **一键复制**：自动生成标准正则表达式格式（如 `/pattern/flags`）

**使用示例**：
- 测试手机号正则：`^(?:(?:\+|00)86)?1[3-9]\d{9}$`
- 验证邮箱格式：`^[A-Za-z0-9\u4e00-\u9fa5]+@[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+$`
- 匹配中文字符：`^[\u4E00-\u9FA5]+$`

#### 🖼️ 图片格式及分辨率调整
**专业图片处理工具**：批量调整图片尺寸、格式和输出路径！

**功能特性**：
- **多格式支持**：支持 PNG、JPG、GIF、BMP、TIFF、ICO 等主流图片格式
- **批量处理**：支持同时处理多张图片，提高工作效率
- **灵活分辨率**：
  - 手动添加自定义分辨率（宽×高）
  - 预设常用分辨率模板：
    - **桌面端**：30x30, 32x32, 44x44, 50x50, 71x71, 89x89, 107x107, 128x128, 142x142, 150x150, 256x256, 284x284, 310x310, 512x512
    - **移动端**：72x72, 96x96, 144x144, 192x192, 40x40, 58x58, 60x60, 80x80, 87x87, 120x120, 180x180, 20x20, 29x29, 76x76, 152x152, 167x167
    - **网站 Favicon**：16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256（自动切换为 ICO 格式）
- **智能输出**：
  - 自定义输出目录（相对路径或绝对路径）
  - 自定义输出文件名前缀
  - 格式转换（如 JPG 转 PNG，或原图格式保持）
- **拖拽操作**：支持拖拽图片到界面，操作更直观
- **进度反馈**：实时显示处理状态和结果路径

**使用场景**：
- 为不同设备生成适配的图标尺寸
- 创建网站 favicon 的多种尺寸版本
- 批量压缩和调整产品图片尺寸
- 为移动端应用准备不同分辨率的资源

#### 🔐 Base64 & MD5 工具
- 快速进行 Base64 编解码
- 生成文件或文本的 MD5 哈希值

#### 🔗 URI 编解码
- 一键执行 `encodeURIComponent` 和 `decodeURIComponent`
- 处理 URL 参数编码问题

### 7. 调试日志快捷添加
快速在代码中添加调试日志：
- 自动识别变量名
- 支持多种日志格式
- 快捷键 `Ctrl + Alt + L` 触发

## 🚀 安装与使用

### 安装方式

**方法一：VS Code 扩展市场**
1. 打开 VS Code
2. 进入扩展商店 (Extensions)
3. 搜索 "YongUtils"
4. 点击安装

**方法二：命令行安装**
```bash
# 在 VS Code 中按 Ctrl+Shift+P
# 输入 "Extensions: Install from VSIX"
# 选择下载的 .vsix 文件
```

### 配置说明

#### AI 翻译配置
要使用 AI 翻译功能，需要配置 OpenAI API Key：

1. 在 VS Code 设置中搜索 "yongutils"
2. 找到 "Yongutils: Translation Api Key" 选项
3. 输入你的 OpenAI API Key

或者在 `settings.json` 中添加：
```json
{
  "yongutils.translationApiKey": "your-api-key-here"
}
```

#### Import 排序规则
可以在设置中自定义 import 排序规则：
```json
{
  "yongutils.importSortRules": {
    "groups": ["builtin", "external", "internal"],
    "newlinesBetween": "always"
  }
}
```

## 🛠 技术架构

### 前端技术栈
- **Webview UI**: Vue 3 + Vite + TypeScript + Tailwind CSS
- **构建工具**: webpack 5 + ts-loader
- **样式处理**: PostCSS + Tailwind

### 后端技术栈
- **主语言**: TypeScript
- **构建系统**: webpack + pnpm
- **测试框架**: Mocha + @vscode/test-electron

### 核心依赖
- `vscode`: ^1.92.0
- `typescript`: ^5.4.5
- `webpack`: ^5.92.1
- `openai`: ^4.77.0
- `vue`: ^3.5.13
- `babel/parser`: ^7.27.0
- `jimp`: ^1.6.0

### 架构设计
- **命令模式**: 所有功能封装为 VS Code 命令
- **模块化组织**: 功能按目录拆分（command, utils, view）
- **单例扩展入口**: `extension.ts` 作为激活入口
- **Webview MVC 结构**: Vue3 实现视图层，TypeScript 处理逻辑

## 🔧 开发环境

### 环境要求
- Node.js >= 18
- pnpm (推荐 8+)
- VS Code 1.92+
- TypeScript 5.4+

### 本地开发
```bash
# 安装依赖
pnpm install

# 持续监听编译
pnpm run watch

# 启动调试
# 在 VS Code 中按 F5，会启动新窗口加载插件
```

### 构建命令
```bash
pnpm run compile        # 一次性编译
pnpm run watch          # 持续监听编译
pnpm run package        # 生产打包
pnpm run test           # 运行测试用例
pnpm run lint           # 执行 ESLint 检查
```

## 📋 使用示例

### Import 排序前后对比

**排序前**:
```javascript
import React from 'react';
import { useState } from 'react';
import fs from 'fs';
import lodash from 'lodash';
import MyComponent from './MyComponent';
import path from 'path';
```

**排序后**:
```javascript
// Node.js 内置模块
import fs from 'fs';
import path from 'path';

// 第三方库
import lodash from 'lodash';
import React from 'react';
import { useState } from 'react';

// 项目内部模块
import MyComponent from './MyComponent';
```

### AI 翻译示例
选中文本 "这是一个测试消息" → 右键翻译 → 得到 "This is a test message"

### 鼠标悬浮翻译示例
在代码中将鼠标悬停在 `"用户登录"` 上，会自动显示悬浮提示框显示 `"User Login"`

### TypeScript 类型生成示例
选中以下对象：
```javascript
const user = {
  id: 1,
  name: "张三",
  email: "zhangsan@example.com",
  isActive: true,
  profile: {
    age: 25,
    city: "北京"
  }
};
```

生成的 TypeScript 类型：
```typescript
interface User {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  profile: {
    age: number;
    city: string;
  };
}
```

### AST 解析示例
打开 Vue 文件，AST 面板会显示：
- **模板部分**：标签结构、组件使用、事件绑定
- **脚本部分**：导入模块、函数定义、变量声明、类结构
- **样式部分**：CSS 规则概览

### 正则表达式测试示例
- **输入正则**：`/^\d{3}-\d{4}-\d{4}$/`
- **测试文本**：`138-1234-5678`
- **结果**：显示完整匹配信息和捕获组

### 图片调整示例
上传一张 1920x1080 的 JPG 图片，设置分辨率 [100x100, 200x200]，选择输出格式 PNG：
- 输出文件：`original_100x100.png`, `original_200x200.png`
- 保存到指定目录（如 `assets/icons/`）

## 🔒 安全与隐私

- **不收集用户数据**: 所有操作都在本地完成
- **API Key 安全**: OpenAI API Key 需用户自行配置，不会在代码中硬编码
- **网络请求透明**: 所有网络请求都会明确提示用户

## 📚 相关文档

- [Import 排序详细说明](./IMPORT_SORTING_README.md)
- [CHANGELOG](./CHANGELOG.md)

## 💡 贡献指南

欢迎提交 Issue 和 Pull Request！在贡献之前，请确保：
1. 遵循项目的代码规范
2. 添加必要的测试用例
3. 更新相关文档

## 📞 支持与反馈

如果在使用过程中遇到任何问题，或者有功能建议，请：
- 在 [GitHub Issues](https://github.com/yonggemengmengda/yongUtils/issues) 中提交
- 或者直接联系开发者

---

**YongUtils** - 让开发更高效，让代码更优雅！✨
