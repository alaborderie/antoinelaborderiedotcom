<script setup lang="ts">
defineProps<{
  title: string
  text: string
  href?: string
}>()
</script>

<template>
  <a class="card" :href="href">
    <h3 class="title">
      {{ title }}
    </h3>
    <p class="text">
      {{ text }}
    </p>
  </a>
</template>
