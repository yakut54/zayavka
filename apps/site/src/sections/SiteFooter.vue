<script setup lang="ts">
import { Badge, Container, Inline, Link, Stack, Text, formatPhone } from '@app/ui'
import { T } from '@app/i18n'

import siteConfig from '../../site.config'

const { contacts } = siteConfig
const phoneText = formatPhone(contacts.phoneE164.replace(/\D/g, ''))
const year = new Date().getFullYear()
const name = T(siteConfig.brand.name)
</script>

<template>
  <footer class="site-footer">
    <Container size="xl">
      <Stack :gap="6">
        <div class="site-footer__top">
          <Stack :gap="2">
            <Text :k="siteConfig.brand.name" variant="h3" as="p" />
            <Link :href="`tel:${contacts.phoneE164}`" :text="phoneText" />
            <Link :href="`mailto:${contacts.email}`" :text="contacts.email" />
          </Stack>
          <Stack :gap="2" as="ul" class="site-footer__links">
            <li><Link k="site.footer.privacy" to="/privacy" /></li>
            <li><Link k="site.footer.consent" to="/consent" /></li>
          </Stack>
        </div>
        <Inline :gap="4" justify="between" wrap>
          <Text
            k="site.footer.copyright"
            :args="{ year, name }"
            variant="body-sm"
            tone="muted"
            as="p"
          />
          <Badge v-if="siteConfig.demo" k="site.footer.demo" tone="warning" />
        </Inline>
      </Stack>
    </Container>
  </footer>
</template>

<style scoped>
.site-footer {
  padding-block: var(--space-10);
  background: var(--color-surface);
  border-block-start: 1px solid var(--color-border-strong);
}

.site-footer__top {
  display: grid;
  gap: var(--space-6);
}

@media (min-width: 768px) {
  .site-footer__top {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
