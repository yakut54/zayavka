<script setup lang="ts">
import { Container, Grid, Heading, Icon, Section, Stack, Text } from '@app/ui'

import siteConfig from '../../site.config'
</script>

<template>
  <Section tone="muted" labelledby="advantages-title">
    <Container size="xl">
      <Stack :gap="8">
        <Heading id="advantages-title" k="site.advantages.title" :level="2" />
        <Grid :cols="{ base: 1, md: 2, lg: siteConfig.advantages.length }" :gap="6" as="ul">
          <li v-for="item in siteConfig.advantages" :key="item.title">
            <Stack :gap="3">
              <span class="advantage__icon"><Icon :name="item.icon" size="lg" /></span>
              <Heading :k="item.title" :level="3" />
              <Text :k="item.text" tone="muted" as="p" />
            </Stack>
          </li>
        </Grid>
      </Stack>
    </Container>
  </Section>
</template>

<style scoped>
.advantage__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-full);
  background: var(--color-accent);
  color: var(--color-text-inverse);
}
</style>
