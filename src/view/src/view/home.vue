<template>
  <Layout @tool-change="setCurSelectType" class="h-full">
    <div class="app-page">
      <div class="app-tool-surface">
        <div class="tool-wrapper" v-if="curSelectType === 'Json'">
          <Json />
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
      </div>
    </div>
  </Layout>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Layout from '../components/Layout.vue';
import Json from './Json.vue';
import Base64AndMd5 from './base64&md5.vue';
import JsToTs from './JsToTs.vue';
import Regexp from './Regexp.vue';
import ImgAutoResize from './imgautoResize.vue';
import Translate from './translate.vue';
import AstPreview from './astPreview.vue';
type ToolType = 'Json' | 'Base64AndMd5' | 'JsToTs' | 'Regexp' | 'ImgAutoResize' | 'AstPreview' | 'Translate';
const curSelectType = ref<ToolType>('AstPreview');


const setCurSelectType = (type: ToolType) => {
  curSelectType.value = type;
};
</script>
