<script setup lang="ts">
import Project from './Project.vue'
</script>

<template>
  <div class="container">
    <Project title="React [Native]" text="Royal Canin, Drivn, Cosmo connected" />
    <Project title="Node" text="Lekooa, Expateo" />
    <Project title="Rust / Elixir" text="Personal projects" />
    <Project title="Python" text="Orange, maladie coronavirus" />
  </div>
</template>

<style scoped>
.container {
  height: calc(100% - 40px);
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10%;
  padding: 2rem 0;
}

@media (max-width: 1024px) {
  .container {
    grid-template-columns: 1fr;
    gap: 5%;
  }
}
</style>
