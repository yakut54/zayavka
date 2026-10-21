import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'

import Checkbox from './Checkbox/Checkbox.vue'
import Field from './Field/Field.vue'
import Input from './Input/Input.vue'
import Link from './Link/Link.vue'
import PasswordInput from './PasswordInput/PasswordInput.vue'
import PhoneInput from './PhoneInput/PhoneInput.vue'
import SearchInput from './SearchInput/SearchInput.vue'
import Select from './Select/Select.vue'
import Textarea from './Textarea/Textarea.vue'

const meta: Meta = { title: 'Поля ввода/Обзор' }
export default meta
type Story = StoryObj

const options = [
  { value: 'a', label: 'demo.option1' },
  { value: 'b', label: 'demo.option2' },
]

const grid = 'display: grid; gap: 16px; max-width: 360px'

export const InputStates: Story = {
  render: () => ({
    components: { Field, Input },
    setup: () => ({ text: ref('demo'), empty: ref('') }),
    template: `
      <div style="${grid}">
        <Field label="demo.label" hint="demo.hint" v-slot="{ id, describedBy }">
          <Input :id="id" :aria-describedby="describedBy" v-model="empty" autocomplete="off" placeholder="demo.placeholder" />
        </Field>
        <Field label="demo.label" optional-mark v-slot="{ id }">
          <Input :id="id" v-model="text" autocomplete="off" clearable prefix-icon="search" />
        </Field>
        <Field label="demo.label" required error="errors.field.required" v-slot="{ id, describedBy, invalid }">
          <Input :id="id" :aria-describedby="describedBy" :invalid="invalid" v-model="empty" autocomplete="off" />
        </Field>
        <Field label="demo.label" v-slot="{ id }">
          <Input :id="id" v-model="text" autocomplete="off" disabled />
        </Field>
        <Field label="demo.label" v-slot="{ id }">
          <Input :id="id" v-model="text" autocomplete="off" readonly />
        </Field>
        <Field label="demo.label" v-slot="{ id }">
          <Input :id="id" v-model="text" autocomplete="off" />
        </Field>
      </div>`,
  }),
}

export const InputStatesDark: Story = { ...InputStates, globals: { theme: 'dark' } }

export const InputHover: Story = {
  render: () => ({
    components: { Field, Input },
    setup: () => ({ v: ref('') }),
    template: `<div style="${grid}"><Field label="demo.label" v-slot="{ id }"><Input :id="id" v-model="v" autocomplete="off" /></Field></div>`,
  }),
  parameters: { pseudo: { hover: true } },
}

export const InputFocus: Story = {
  ...InputHover,
  parameters: { pseudo: { focusWithin: true, focus: true } },
}

export const Password: Story = {
  render: () => ({
    components: { Field, PasswordInput },
    setup: () => ({ v: ref('secret-password') }),
    template: `<div style="${grid}"><Field label="demo.label" v-slot="{ id }"><PasswordInput :id="id" v-model="v" autocomplete="current-password" /></Field></div>`,
  }),
}

export const Phone: Story = {
  render: () => ({
    components: { Field, PhoneInput },
    setup: () => ({ empty: ref(''), full: ref('79991234567'), invalid: ref('7999') }),
    template: `
      <div style="${grid}">
        <Field label="demo.label" v-slot="{ id }"><PhoneInput :id="id" v-model="empty" /></Field>
        <Field label="demo.label" v-slot="{ id }"><PhoneInput :id="id" v-model="full" /></Field>
        <Field label="demo.label" error="errors.field.phone_invalid" v-slot="{ id, invalid: bad, describedBy }">
          <PhoneInput :id="id" :invalid="bad" :aria-describedby="describedBy" v-model="invalid" />
        </Field>
      </div>`,
  }),
}

export const TextareaStates: Story = {
  render: () => ({
    components: { Field, Textarea },
    setup: () => ({ short: ref('Короткий текст'), nearLimit: ref('я'.repeat(185)), auto: ref('') }),
    template: `
      <div style="${grid}">
        <Field label="demo.label" v-slot="{ id }"><Textarea :id="id" v-model="short" :maxlength="200" /></Field>
        <Field label="demo.label" v-slot="{ id }"><Textarea :id="id" v-model="nearLimit" :maxlength="200" /></Field>
        <Field label="demo.label" error="errors.field.too_long" v-slot="{ id, invalid }"><Textarea :id="id" :invalid="invalid" v-model="short" /></Field>
        <Field label="demo.label" v-slot="{ id }"><Textarea :id="id" v-model="auto" autoresize :rows="2" :max-rows="6" /></Field>
        <Field label="demo.label" v-slot="{ id }"><Textarea :id="id" v-model="short" disabled /></Field>
      </div>`,
  }),
}

export const SelectStates: Story = {
  render: () => ({
    components: { Field, Select },
    setup: () => ({ v: ref(''), chosen: ref('b'), options }),
    template: `
      <div style="${grid}">
        <Field label="demo.label" v-slot="{ id }"><Select :id="id" v-model="v" :options="options" placeholder="demo.placeholder" /></Field>
        <Field label="demo.label" v-slot="{ id }"><Select :id="id" v-model="chosen" :options="options" /></Field>
        <Field label="demo.label" error="errors.field.required" v-slot="{ id, invalid }"><Select :id="id" :invalid="invalid" v-model="v" :options="options" placeholder="demo.placeholder" /></Field>
        <Field label="demo.label" v-slot="{ id }"><Select :id="id" v-model="chosen" :options="options" disabled /></Field>
      </div>`,
  }),
}

export const CheckboxStates: Story = {
  render: () => ({
    components: { Checkbox, Link },
    setup: () => ({ off: ref(false), on: ref(true) }),
    template: `
      <div style="${grid}">
        <Checkbox v-model="off"><i18n-t keypath="demo.consent" tag="span"><template #policy><Link k="demo.policyLink" href="/privacy" /></template><template #terms><Link k="demo.termsLink" href="/consent" /></template></i18n-t></Checkbox>
        <Checkbox v-model="on"><i18n-t keypath="demo.consent" tag="span"><template #policy><Link k="demo.policyLink" href="/privacy" /></template><template #terms><Link k="demo.termsLink" href="/consent" /></template></i18n-t></Checkbox>
        <Checkbox v-model="off" invalid><i18n-t keypath="demo.consent" tag="span"><template #policy><Link k="demo.policyLink" href="/privacy" /></template><template #terms><Link k="demo.termsLink" href="/consent" /></template></i18n-t></Checkbox>
        <Checkbox v-model="on" disabled><i18n-t keypath="demo.consent" tag="span"><template #policy><Link k="demo.policyLink" href="/privacy" /></template><template #terms><Link k="demo.termsLink" href="/consent" /></template></i18n-t></Checkbox>
      </div>`,
  }),
}

export const CheckboxDark: Story = { ...CheckboxStates, globals: { theme: 'dark' } }

export const Search: Story = {
  render: () => ({
    components: { SearchInput },
    setup: () => ({ v: ref('') }),
    template: `<div style="${grid}"><SearchInput v-model="v" placeholder="demo.placeholder" aria-label="Поиск" /></div>`,
  }),
}
