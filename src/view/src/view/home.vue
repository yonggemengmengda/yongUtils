<template>
  <Layout :active-tool="curSelectType" @tool-change="setCurSelectType" class="h-full">
    <div class="app-page">
      <div class="app-tool-surface">
        <div class="tool-wrapper" v-if="curSelectType === 'Json'">
          <Json />
        </div>
        <div class="tool-wrapper" v-else-if="curSelectType === 'AiConfig'">
          <AiConfig />
        </div>
        <div class="tool-wrapper" v-else-if="curSelectType === 'Base64AndMd5'">
          <Base64AndMd5 />
        </div>
        <div class="tool-wrapper" v-else-if="curSelectType === 'JsToTs'">
          <JsToTs />
        </div>
        <div class="tool-wrapper" v-else-if="curSelectType === 'Regexp'">
          <Regexp />
        </div>
        <div class="tool-wrapper" v-else-if="curSelectType === 'ImgAutoResize'">
          <ImgAutoResize />
        </div>
        <div class="tool-wrapper" v-else-if="curSelectType === 'AstPreview'">
          <AstPreview />
        </div>
        <div class="tool-wrapper" v-else-if="curSelectType === 'Translate'">
          <Translate />
        </div>
        <div class="tool-wrapper" v-else-if="curSelectType === 'GitCommitConfig'">
          <GitCommitConfig />
        </div>
      </div>
    </div>
  </Layout>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, provide, ref } from 'vue';
import Layout from '../components/Layout.vue';
import AiConfig from './aiConfig.vue';
import Json from './Json.vue';
import Base64AndMd5 from './base64&md5.vue';
import JsToTs from './JsToTs.vue';
import Regexp from './Regexp.vue';
import ImgAutoResize from './imgautoResize.vue';
import Translate from './translate.vue';
import AstPreview from './astPreview.vue';
import GitCommitConfig from './gitCommitConfig.vue';
type ToolType = 'AiConfig' | 'Json' | 'Base64AndMd5' | 'JsToTs' | 'Regexp' | 'ImgAutoResize' | 'AstPreview' | 'Translate' | 'GitCommitConfig';
const curSelectType = ref<ToolType>('AstPreview');


const setCurSelectType = (type: ToolType) => {
  curSelectType.value = type;
};

provide("navigateToTool", (tool: ToolType) => {
  curSelectType.value = tool
})

function handleMessage(event: MessageEvent) {
  const message = event.data
  if (message.command === "navigateToTool" && typeof message.data === "string") {
    curSelectType.value = message.data as ToolType
  }
}

onMounted(() => {
  window.addEventListener("message", handleMessage)
})

onUnmounted(() => {
  window.removeEventListener("message", handleMessage)
})
</script>
