# Import 排序功能详解

YongUtils 的 Import 排序功能可以帮助你自动整理 JavaScript/TypeScript/Vue 文件中的 import 语句，使其更加规范和易读。

## 🎯 功能特点

### 智能分组
Import 语句会按照以下优先级自动分组：

1. **Node.js 内置模块** (如 `fs`, `path`, `http`)
2. **第三方库** (如 `react`, `lodash`, `vue`)
3. **项目内部模块** (相对路径导入，如 `./utils`, `../components`)

### 自动排序
- 每个组内的 import 语句按字母顺序排序
- 支持多行 import 的正确处理
- 保持原有的注释和空行结构（在合理范围内）

### 配置灵活
支持通过 VS Code 设置自定义排序规则。

## 🔧 配置选项

### 基础配置
在 VS Code 设置中搜索 "yongutils" 或在 `settings.json` 中配置：

```json
{
  "yongutils.importSortRules": {
    "groups": ["builtin", "external", "internal"],
    "newlinesBetween": "always",
    "ignoreCase": true
  }
}
```

### 高级配置
支持更细粒度的控制：

```json
{
  "yongutils.importSortRules": {
    // 分组顺序
    "groups": [
      "builtin",           // Node.js 内置模块
      "external",          // 第三方库
      "internal",          // 项目内部模块
      "parent",            // 父级目录导入
      "sibling",           // 同级目录导入
      "index"              // index 文件导入
    ],
    // 组间是否添加空行
    "newlinesBetween": "always", // always, never, ignore
    // 是否忽略大小写
    "ignoreCase": true,
    // 特定前缀的特殊处理
    "prefixGroups": [
      { "prefix": "@", "group": "external" },
      { "prefix": "~/", "group": "internal" }
    ]
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
- **内置模块**: 通过 Node.js 内置模块列表识别
- **第三方库**: 不以 `./`, `../`, `/` 开头的导入
- **内部模块**: 以 `./`, `../` 开头的相对路径导入

### 特殊情况处理
- **带副作用的 import**: 如 `import 'babel-polyfill'` 会被保留在合适位置
- **条件导入**: 在 if/else 语句中的 import 不会被处理
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