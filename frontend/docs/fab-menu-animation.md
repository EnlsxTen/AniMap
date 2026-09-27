# 右下角浮动发布菜单动画实现

本文档说明首页右下角发布菜单的实现方式。独立示例源码见：

`frontend/docs/fab-menu-animation-example.tsx`

## 依赖

需要两个依赖：

```bash
npm install gsap lucide-react
```

当前项目已经安装了这两个包。

## 核心结构

菜单由三层组成：

```tsx
<div className="relative">
  <div role="menu">
    <button role="menuitem">发布活动</button>
    <button role="menuitem">发布商铺</button>
    <button role="menuitem">发布组局</button>
  </div>

  {open && <button className="fixed inset-0" />}

  <button aria-haspopup="menu">+</button>
</div>
```

作用分别是：

- `role="menu"`：承载三个发布入口。
- 全屏透明按钮：菜单打开时点击空白区域关闭。
- FAB 主按钮：控制 `open` 状态，并作为 GSAP 动画目标。

## 状态和引用

组件里维护一个开关状态：

```tsx
const [open, setOpen] = useState(false);
```

同时用 `ref` 拿到真实 DOM：

```tsx
const fabRef = useRef<HTMLButtonElement | null>(null);
const actionRefs = useRef<Array<HTMLButtonElement | null>>([]);
```

这里不用纯 CSS 的原因是：菜单项有“压缩、弹出、回弹、错峰”的连续动作，GSAP timeline 更容易控制每一步的时间点和缓动曲线。

## 打开动画

打开时先把三个菜单项放到右下角附近，缩小、旋转并隐藏：

```tsx
timeline.set(items, {
  autoAlpha: 0,
  x: 46,
  y: (index) => 74 + index * 66,
  scale: 0.12,
  rotate: 22,
  transformOrigin: '100% 100%',
});
```

然后主按钮先被挤压，再回弹旋转到 `45deg`：

```tsx
timeline
  .to(button, {
    rotate: 36,
    scaleX: 1.18,
    scaleY: 0.84,
    duration: 0.1,
    ease: 'power3.out',
  })
  .to(button, {
    rotate: 45,
    scaleX: 1,
    scaleY: 1,
    duration: 0.58,
    ease: 'elastic.out(1.35, 0.42)',
  }, 0.08);
```

菜单项使用错峰弹出：

```tsx
items.forEach((item, index) => {
  timeline
    .to(item, {
      autoAlpha: 1,
      x: -10,
      y: -8,
      scaleX: 1.08,
      scaleY: 0.92,
      rotate: -3,
      duration: 0.25,
      ease: 'power3.out',
    }, 0.04 + index * 0.065)
    .to(item, {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotate: 0,
      duration: 0.55,
      ease: 'elastic.out(1.15, 0.52)',
    }, 0.22 + index * 0.065);
});
```

`index * 0.065` 是错峰时间，数值越大，每个菜单项之间的延迟越明显。

## 关闭动画

关闭时主按钮恢复角度，并做一次反向挤压：

```tsx
timeline
  .to(button, {
    rotate: 0,
    scaleX: 0.9,
    scaleY: 1.12,
    duration: 0.1,
    ease: 'power3.out',
  })
  .to(button, {
    scaleX: 1,
    scaleY: 1,
    duration: 0.32,
    ease: 'elastic.out(1, 0.55)',
  }, 0.08);
```

菜单项按反向顺序收回，避免同时消失显得生硬：

```tsx
[...items].reverse().forEach((item, reverseIndex) => {
  const index = items.indexOf(item);

  timeline
    .to(item, {
      x: -7,
      y: -7,
      scaleX: 1.06,
      scaleY: 0.94,
      rotate: -2,
      duration: 0.08,
      ease: 'power2.out',
    }, reverseIndex * 0.035)
    .to(item, {
      autoAlpha: 0,
      x: 48,
      y: 74 + index * 66,
      scale: 0.16,
      rotate: 18,
      duration: 0.22,
      ease: 'power3.in',
    }, 0.08 + reverseIndex * 0.035);
});
```

## 为什么动画更 Q 弹

关键是这几处：

- `scaleX` 和 `scaleY` 不等比缩放，模拟按钮被挤压的感觉。
- `elastic.out(...)` 负责回弹。
- 菜单项先过冲到 `x: -10, y: -8`，再回到 `0, 0`。
- 菜单项使用错峰时间，不是一起弹出。

如果想更弹，可以调大：

```tsx
ease: 'elastic.out(1.5, 0.38)'
```

如果想更稳，可以调小：

```tsx
ease: 'elastic.out(1.0, 0.6)'
```

## 接入首页

首页当前接入点在 `Home.tsx`：

- `publishMenuOpen`：控制菜单开关。
- `publishFabRef`：主按钮 DOM。
- `publishActionRefs`：菜单项 DOM 数组。
- `useLayoutEffect`：执行 GSAP timeline。
- `publishActions`：配置发布活动、商铺、组局三个入口。

如果要把它组件化，可以直接使用示例里的：

```tsx
<FloatingPublishMenu
  isAuthenticated={isAuthenticated()}
  onNavigate={(to) => navigate(to)}
/>
```

然后把原来首页里对应的 FAB JSX、`publishMenuOpen`、`publishFabRef`、`publishActionRefs` 和 GSAP 动画逻辑移到组件内部。
