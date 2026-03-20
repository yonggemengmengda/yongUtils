# Import 排序功能详解

YongUtils 的 Import 排序功能可以帮助你自动整理 JavaScript/TypeScript/Vue 文件中的 import 语句，使其更加规范和易读。

## 🎯 功能特点

### 智能分组
Import 语句会按照以下优先级自动分组：

1. **副作用导入** (如 `import 'reflect-metadata'`)
2. **Node.js 内置模块** (如 `fs`, `path`, `http`)
3. **第三方库** (如 `react`, `lodash`, `vue`)
4. **项目 alias 模块** (如 `@/utils`, `~/stores`)
5. **父级目录导入**
6. **同级目录导入**
7. **index 导入**

### 自动整理
- 每个组内的 import 语句按字母顺序排序
- 支持 `import type`、多行 import 和副作用 import
- 可选移除未使用 import
- 支持 Vue SFC、JSX、TSX
- 提供 Code Action，并支持保存时自动整理

### 配置灵活
支持通过 VS Code 设置自定义排序规则。

## 🔧 配置选项

### 基础配置
在 VS Code 设置中搜索 "yongutils" 或在 `settings.json` 中配置：

```json
{
  "yongutils.importSorter.sortOnSave": true,
  "yongutils.importSorter.removeUnusedImports": true,
  "yongutils.importSorter.placeSideEffectImportsFirst": true,
  "yongutils.importSorter.internalLibPrefixes": ["@/", "~/"]
}
```

### 高级配置
支持更细粒度的控制：

```json
{
  "yongutils.importSorter.addGroupComments": true,
  "yongutils.importSorter.sortByLength": false,
  "yongutils.importSorter.sortOnSave": true,
  "yongutils.importSorter.removeUnusedImports": true,
  "yongutils.importSorter.placeSideEffectImportsFirst": true,
  "yongutils.importSorter.internalLibPrefixes": ["@@@/", "@@/", "@/", "~/"],
  "yongutils.importSorter.customGroupNames": {
    "side-effect": "副作用导入",
    "builtin": "Node.js 内置模块",
    "external": "第三方依赖",
    "internal-alias": "项目别名模块",
    "parent": "父级目录模块",
    "sibling": "同级目录模块",
    "index": "Index 模块"
  }
}
```

## 📝 使用示例

### 基础用法
1. 打开任意包含 import 语句的文件
2. 右键编辑器 → 选择 "Sort Imports"
3. 或使用命令面板 (`Ctrl+Shift+P`) → 输入 "Sort Imports"

### 快捷键
可以在 `keybindings.json` 中设置快捷键：
```json
{
  "key": "ctrl+shift+i",
  "command": "yongutils.sortImports",
  "when": "editorTextFocus"
}
```

## 🔄 排序规则说明

### 识别规则
- **副作用导入**: `import 'xx'`
- **内置模块**: 通过 Node.js 内置模块列表识别
- **第三方库**: 非相对路径且不命中 alias 前缀
- **内部 alias 模块**: 命中 `yongutils.importSorter.internalLibPrefixes` 或 `tsconfig/jsconfig paths`
- **相对路径模块**: 按 `parent / sibling / index` 进一步细分

### 特殊情况处理
- **带副作用的 import**: 如 `import 'babel-polyfill'` 默认固定排在最前面
- **未使用导入**: 可根据配置自动移除
- **动态导入**: `import()` 表达式不会被排序

## ⚠️ 注意事项

1. **备份重要代码**: 虽然功能经过充分测试，但建议在重要项目中先备份
2. **Git 差异**: 大量 import 重排可能会产生较大的 Git diff
3. **团队协作**: 建议团队统一配置，避免不同开发者产生不同的排序结果

## 🛠 故障排除

### 常见问题
**Q: 排序后代码格式混乱？**
A: 确保已安装并启用了 Prettier 或其他代码格式化工具

**Q: 某些 import 没有被正确分组？**
A: 检查 import 路径是否符合识别规则，或在配置中添加自定义前缀规则

**Q: 排序功能没有生效？**
A: 
1. 确认文件类型是否支持 (.js, .ts, .jsx, .tsx, .vue)
2. 检查是否有语法错误导致解析失败
3. 查看 VS Code 输出面板中的 YongUtils 日志

### 调试模式
启用调试日志来查看详细处理过程：
```json
{
  "yongutils.debug": true
}
```

## 📈 性能优化

- **增量处理**: 只处理实际发生变化的 import 语句
- **缓存机制**: 对已处理的文件进行缓存，提高重复操作速度
- **异步执行**: 不阻塞编辑器主线程

## 🤝 与其他工具集成

### ESLint
可以与 ESLint 的 `sort-imports` 规则配合使用，但建议只使用其中一种以避免冲突。

### Prettier
与 Prettier 完美兼容，排序后的代码会自动符合 Prettier 格式规范。

### EditorConfig
遵循项目中的 `.editorconfig` 设置，确保一致性。

---

通过 YongUtils 的 Import 排序功能，你可以轻松维护整洁、规范的代码导入结构，提升代码可读性和团队协作效率！
