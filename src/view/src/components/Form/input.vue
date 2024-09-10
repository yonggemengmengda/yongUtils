<template>
	<label for="myInput" class="my-input mx-12 border">
		<textarea
			id="myInput"
			class="input"
			name="text"
			rows="4"
			v-model="props.modelValue"
			:placeholder="props.placeholder"
			type="text"
		/>
	</label>
</template>

<script setup lang="ts">
  const props = defineProps({
    modelValue: {
      type: String,
      default: "",
    },
		placeholder: {
			type: String,
			default: "请输入要转换的response",
		}
	})
</script>

<style scoped>
/* From Uiverse.io by roroland */
.my-input {
	--border: rgba(66, 66, 66, 0.733);
	--bgLabel: rgba(120, 120, 120, 1);
	--bgInput: rgba(255, 255, 255, 1);
	--color-light: rgb(141, 80, 238);
	--color-light-a: rgb(133, 123, 150);
	display: grid;
	grid-template-columns: 1fr 1fr;
	grid-template-rows: -webkit-min-content -webkit-min-content;
	grid-template-rows: min-content min-content;
	background: var(--bgLabel);
	position: relative;
	font-size: 0.65rem;
	-webkit-transition: all 0.3s ease-out;
	transition: all 0.3s ease-out;
}

.my-input > .label-title {
	border: 1px solid var(--color-light);
	color: var(--color-light);
	-webkit-box-shadow: 0 2px 2px rgba(120, 120, 120, 0.25);
	box-shadow: 0 2px 2px rgba(120, 120, 120, 0.25);
	padding: 0.25em 0.5em;
	background-color: var(--bgInput);
	grid-column: 1 / span 1;
	grid-row: 1 / span 1;
	position: relative;
	border-radius: 4px;
	translate: 10px -10px;
	-webkit-transition: all 0.5s ease-out 0.5s;
	transition: all 0.5s ease-out 0.5s;
	z-index: 10;
}

.my-input:focus .input,
.my-input:focus-within .input {
	background-color: var(--bgInput);
	padding: 1em;
	color: var(--color-light);
	border: 2px solid var(--color-light);
	outline: 2px solid var(--color-light);
	outline-offset: -2px;
	border-radius: 12px;
	-webkit-box-shadow: 0 5px 10px rgba(98, 0, 255, 0.25),
		0 -5px 20px rgba(98, 0, 255, 0.1);
	box-shadow: 0 5px 10px rgba(98, 0, 255, 0.25),
		0 -5px 20px rgba(98, 0, 255, 0.1);
	scale: 1.15;
	-webkit-transition: all 0.5s cubic-bezier(0, 1.46, 1, 1.62) 0.3s;
	transition: all 0.5s cubic-bezier(0, 1.46, 1, 1.62) 0.3s;
}

.my-input:focus,
.my-input:focus-within .label-title {
	translate: 10px -20px;
	border-radius: 4px 4px 0 0;
	z-index: 0;
	-webkit-transition: all 0.3s cubic-bezier(0, 1.46, 1, 1.62);
	transition: all 0.3s cubic-bezier(0, 1.46, 1, 1.62);
}

.input {
	-webkit-appearance: none;
	-moz-appearance: none;
	appearance: none;
	border-top: 2px solid transparent;
	border-right: 2px solid transparent;
	border-bottom: 2px solid var(--color-light);
	border-left: 2px solid transparent;
	background-color: var(--bgInput);
	caret-color: var(--color-light);
	min-width: 200px;
	padding: 1.25em 1em 0.25em;
	outline: 0px solid var(--color-light);
	grid-column: 1/-1;
	grid-row: 1 / -1;
	position: relative;
	-webkit-transition: all 0.3s cubic-bezier(0.5, 0.6, 0.5, 0.62);
	transition: all 0.3s cubic-bezier(0.5, 0.6, 0.5, 0.62);
	z-index: 0;
}

.input::-webkit-input-placeholder {
	color: var(--color-light-a);
}

.input::-moz-placeholder {
	color: var(--color-light-a);
}

.input:-ms-input-placeholder {
	color: var(--color-light-a);
}

.input::-ms-input-placeholder {
	color: var(--color-light-a);
}

.input,
.input::placeholder {
	color: var(--color-light-a);
}
</style>

