<script setup lang="ts">
defineProps<{
  title: string
  text: string
  href: string
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

<style scoped>
.card {
  border-radius: 4px;
  background-color: var(--color-background-soft);
  padding: 8px;
  transition: 0.4s;
  cursor: pointer;
  height: 200px;
  width: 250px;

  @media (max-width: 1024px) {
    height: 150px;
    width: inherit;
  }
}

.card:hover {
  transform: scale(1.4);
}

.title {
  text-align: center;
  font-size: 1.3rem;
  font-weight: bold;
}

.text {
  padding: 8px;
  text-align: center;
  vertical-align: middle;
}
</style>
