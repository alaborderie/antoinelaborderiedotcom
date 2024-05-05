<script setup lang="ts">
import SocialIconLink from './SocialIconLink.vue'
import MyProjects from './MyProjects.vue'
</script>

<template>
  <div class="socials">
    <SocialIconLink social="github" href="https://github.com/alaborderie" />
    <SocialIconLink social="github" href="https://github.com/alaborderie" />
    <SocialIconLink social="github" href="https://github.com/alaborderie" />
    <SocialIconLink social="github" href="https://github.com/alaborderie" />
  </div>
  <div class="content">
    <MyProjects />
  </div>
</template>

<style scoped>
.socials {
  display: flex;
  justify-content: center;
  align-items: center;

  a {
    margin: 0 16px;
  }
}

.content {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
}
</style>
