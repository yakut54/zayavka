<script setup lang="ts">
import { Container, Heading, Section, Stack, Text } from '@app/ui'

import siteConfig from '../../site.config'
</script>

<template>
  <Section id="process" tone="muted" labelledby="process-title">
    <Container size="xl">
      <Stack :gap="8">
        <Heading id="process-title" k="site.process.title" :level="2" />
        <ol class="steps">
          <li v-for="step in siteConfig.process" :key="step.title" class="steps__item">
            <Stack :gap="2">
              <Heading :k="step.title" :level="3" />
              <Text :k="step.text" tone="muted" as="p" />
            </Stack>
          </li>
        </ol>
      </Stack>
    </Container>
  </Section>
</template>

<style scoped>
.steps {
  display: grid;
  gap: var(--space-6);
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

.steps__item {
  position: relative;
  padding-inline-start: var(--space-12);
  counter-increment: step;
}

.steps__item::before {
  content: counter(step);
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  color: var(--color-text-inverse);
  font-weight: 700;
}

@media (min-width: 768px) {
  .steps {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-8);
  }

  .steps__item {
    padding-inline-start: 0;
    padding-block-start: var(--space-12);
  }
}
</style>
