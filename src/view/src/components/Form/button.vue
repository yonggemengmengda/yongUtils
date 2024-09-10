<template>
	<button class="y-btn" @click="handleClick">
    <slot />
  </button>
</template>

<script setup lang="ts">
  const emit = defineEmits(['click'])
  const handleClick = () => {
    emit('click')
  }
</script>

<style scoped>
.y-btn {
	font: inherit;
	background-color: var(--color-background-tertiary);
	border: 0;
	color: var(--color-text);
	border-radius: 0.5em;
	font-size: 0.75rem;
	padding: 0.375em 1em;
	font-weight: 600;
	text-shadow: 0 0.0625em 0 rgba(0, 0, 0, 0.3);
	box-shadow: inset 0 0.0625em 0 0 rgba(0, 0, 0, 0.2), 
		0 0.0625em 0 0 rgba(0, 0, 0, 0.25),
		0 0.125em 0 0 rgba(0, 0, 0, 0.2),
		0 0.25em 0 0 rgba(0, 0, 0, 0.15),
		0 0.3125em 0 0 rgba(0, 0, 0, 0.1),
		0 0.375em 0 0 rgba(0, 0, 0, 0.05),
		0 0.425em 0 0 rgba(0, 0, 0, 0.02),
		0 0.425em 0.5em 0 rgba(0, 0, 0, 0.1);
	transition: 0.15s ease;
	cursor: pointer;
}

.y-btn:active {
	translate: 0 0.225em;
	box-shadow: inset 0 0.03em 0 0 rgba(0, 0, 0, 0.2), 
		0 0.03em 0 0 rgba(0, 0, 0, 0.25),
		0 0.0625em 0 0 rgba(0, 0, 0, 0.2),
		0 0.125em 0 0 rgba(0, 0, 0, 0.15),
		0 0.125em 0 0 rgba(0, 0, 0, 0.1),
		0 0.2em 0 0 rgba(0, 0, 0, 0.05),
		0 0.225em 0 0 rgba(0, 0, 0, 0.02),
		0 0.225em 0.375em 0 rgba(0, 0, 0, 0.1);
}
</style>
