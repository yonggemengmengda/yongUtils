# Vue Import 排序功能

## 功能描述

为 VS Code 扩展 `yongutils` 添加了通过鼠标右键菜单排序 Vue 文件 import 语句的功能。

## 排序规则

1. **组件导入**排在**工具库导入**的上面
2. **组件导入**按模块名长度由短到长排序
3. **工具库导入**按模块名长度由短到长排序
4. 保持原有的 import 语句格式（包括分号、换行等）

## 支持的文件类型

- `.vue` 文件
- `.js` 文件  
- `.ts` 文件

## 使用方法

1. 打开 Vue、JavaScript 或 TypeScript 文件
2. 在编辑器中右键点击
3. 在右键菜单中选择"排序Vue Import语句"
4. import 语句将自动重新排序

## 识别规则

### 组件导入（优先排序）
- 包含 `.vue` 扩展名的导入
- 从 `@/components/` 路径导入
- 从 `@/views/` 路径导入
- 从 `@/layouts/` 路径导入
- 从 `@/pages/` 路径导入

### 工具库导入（次要排序）
- Vue 核心库（`vue`, `vue-router`, `vuex` 等）
- UI 组件库（`element-plus`, `ant-design-vue` 等）
- 工具库（`lodash`, `date-fns`, `axios` 等）
- 其他第三方库

## 示例

### 排序前

```javascript
import { debounce, throttle, cloneDeep } from 'lodash'
import { format, parse, isValid } from 'date-fns'
import { useRoute, useRouter } from 'vue-router'
import TestComponent from '@/components/TestComponent.vue'
import UserCard from '@/components/UserCard.vue'
import { ElButton, ElInput } from 'element-plus'
import ProductList from '@/views/ProductList.vue'
```

### 排序后

```javascript
import TestComponent from '@/components/TestComponent.vue'
import UserCard from '@/components/UserCard.vue'
import ProductList from '@/views/ProductList.vue'
import { ElButton, ElInput } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { debounce, throttle, cloneDeep } from 'lodash'
import { format, parse, isValid } from 'date-fns'
```

## 注意事项

- **安全性保证**：该功能会确保所有 import 语句都被正确识别和保留，不会丢失任何导入
- 该功能会保留所有 import 语句的原始格式
- 注释和空行会被保留在适当的位置
- 如果文件中没有 import 语句，则不会进行任何更改
- 仅支持标准的 ES6 import 语法
- 排序前会验证 import 语句数量，确保没有丢失任何导入
