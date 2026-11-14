<template>
  <Codemirror :model-value="modelValue" :placeholder="placeholder" :style="{height:'100%',fontSize:'13px'}" :disabled="disabled" :indent-with-tab="true" :tab-size="2" :extensions="extensions" class="code-mirror" @update:model-value="value=>emit('update:modelValue',value)" @ready="emit('ready')" />
</template>
<script setup lang="ts">
import {Codemirror} from 'vue-codemirror'
import {oneDark} from '@codemirror/theme-one-dark'
import {javascript} from '@codemirror/lang-javascript'
defineProps<{modelValue:string;placeholder:string;disabled?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:string];ready:[]}>()
const extensions=[oneDark,javascript()]
</script>
