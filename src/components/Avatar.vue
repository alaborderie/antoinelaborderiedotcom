<script setup lang="ts"></script>

<template>
  <div class="avatar">
    <img src="../assets/me.jpg" />
  </div>
</template>

<style scoped>
.avatar {
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  border: 4px solid white;
  overflow: hidden;
  margin-top: 72px;

  @media (max-width: 1024px) {
    margin-top: 0;
    img {
      width: calc(100vw - 4rem);
      object-fit: contain;
    }
  }
}
</style>
