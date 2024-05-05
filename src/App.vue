<script setup lang="ts">
import Hero from './components/Hero.vue'
import Avatar from './components/Avatar.vue'
</script>

<template>
  <div class="title">
    <h1>Freelance Web Developer</h1>
    <h2>Antoine Laborderie</h2>
  </div>

  <header>
    <Avatar />
  </header>

  <main>
    <Hero />
  </main>
</template>

<style scoped>
.title {
  grid-column: 1/3;
  text-align: center;
  margin-bottom: 2rem;

  @media (min-width: 1024px) {
    margin-bottom: 6rem;
  }
}

header {
  line-height: 1.5;
  padding-bottom: 2rem;
}

@media (min-width: 1024px) {
  header {
    display: flex;
    place-items: center;
    padding-bottom: 0;
    padding-right: calc(var(--section-gap) / 2);
  }

  main {
    height: 100%;
  }
}
</style>
