<script setup lang="ts">
defineProps<{
  social: string
  href: string
}>()
</script>

<template>
  <a class="link" :href target="_blank" rel="noopener">
    <img :src="`public/${social}.svg`" height="32px" width="32px" />
  </a>
</template>

<style scoped>
.link {
  padding: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
