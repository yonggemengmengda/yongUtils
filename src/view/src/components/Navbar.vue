<template>
  <nav class="tool-nav" aria-label="工具导航">
    <button
      v-for="tool in toolList"
      :key="tool.key"
      type="button"
      class="tool-button"
      :title="tool.name"
      :aria-label="tool.name"
      :data-active="activeTool === tool.key"
      :aria-pressed="activeTool === tool.key"
      @click="changeTool(tool)"
    >
      <span class="tool-icon" v-if="tool.icon">
        <component :is="tool.icon" class="w-4 h-4" />
      </span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { 
  DataBaseAlt,
  Locked,
  Code,
  StringText,
  Image,
  ChartTreemap,
  Translate
} from '@vicons/carbon';

const toolList = [
  {
    name: 'AST解析',
    icon: ChartTreemap,
    key: 'AstPreview'
  },
  {
    name: 'JSON序列化',
    icon: DataBaseAlt,
    key: 'Json'
  },
  {
    name: 'Base64和Md5',
    icon: Locked,
    key: 'Base64AndMd5'
  },
  {
    name: 'js转ts',
    icon: Code,
    key: 'JsToTs'
  },
  {
    name: '正则表达式',
    icon: StringText,
    key: 'Regexp'
  },
  {
    name: '图片调整',
    icon: Image,
    key: 'ImgAutoResize'
  },
  {
    name: '翻译管理',
    icon: Translate,
    key: 'Translate'
  }
]

const activeTool = ref('AstPreview');
const emit = defineEmits(['tool-change']);

const changeTool = (tool: any) => {
  activeTool.value = tool.key;
  emit('tool-change', tool.key);
}
</script>
