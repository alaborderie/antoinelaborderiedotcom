<script setup lang="ts">
import Hero from './components/Hero.vue'
import Avatar from './components/Avatar.vue'
</script>

<template>
  <div class="title">
    <h1>Freelance Web Developer</h1>
    <h2>Antoine Laborderie</h2>
  </div>

  <header class="m-4 grid gap-4 grid-cols-2">
    <Avatar />
    <div class="flex flex-col justify-center">
      <p>Need a website? A mobile app? Something to automate?</p>
      <p>Contact me! We can build together the best solution for your business.</p>
    </div>
  </header>

  <main>
    <Hero />
  </main>
</template>
