import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const Privacy: React.FC = () => (
  <div className="min-h-screen-safe bg-primary-50 dark:bg-night-200">
    <div className="max-w-2xl mx-auto px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-flat shadow-block-lg p-7 sm:p-8"
      >
        <div className="text-center mb-6">
          <Link to="/" className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-action border-3 border-ink dark:border-night-400 shadow-block mb-3">
            <Sparkles className="w-7 h-7 text-white" strokeWidth={2.5} />
          </Link>
          <h1 className="font-display text-2xl text-ink dark:text-primary-100">隐私政策</h1>
          <p className="mt-1 text-sm text-ink-muted">最后更新于 2026 年 6 月</p>
        </div>

        <div className="prose prose-sm max-w-none text-ink dark:text-primary-100 space-y-4">
          <section>
            <h2 className="font-bold text-lg mb-2">一、信息收集</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>注册信息：邮箱、用户名、手机号（选填）。</li>
              <li>位置信息：经您明确授权后，我们获取您的粗略地理位置，仅用于展示附近的展会距离。</li>
              <li>登录信息：登录时间、IP 地址等用于安全审计的基础数据。</li>
              <li>发布内容：您发布的展会信息、评论、弹幕等内容。</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-2">二、信息使用</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>提供核心服务：展示展会、管理收藏、发送邮件通知等。</li>
              <li>位置信息仅在前端本地计算距离，不会上传或存储到服务器。</li>
              <li>邮箱用于账号注册、密码找回和您主动开启的展会提醒通知。</li>
              <li>我们不会将您的个人信息出售给第三方。</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-2">三、信息存储与安全</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>您的数据存储在中国境内的服务器上。</li>
              <li>密码采用加密方式存储，不会明文保存。</li>
              <li>我们采用合理的技术手段保护您的信息安全，但无法保证绝对安全。</li>
              <li>建议您使用高强度密码并定期更换。</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-2">四、Cookie 与本地存储</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>本平台使用 localStorage 存储您的登录凭证和偏好设置。</li>
              <li>位置授权偏好会存储在您的浏览器中，用于记忆您的选择。</li>
              <li>我们使用高德地图 SDK，其可能根据自身隐私政策收集位置相关信息。</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-2">五、您的权利</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>您可以在个人中心查看和修改您的个人信息。</li>
              <li>您可以随时在浏览器设置中撤销位置授权。</li>
              <li>您可以联系平台管理员删除您的账号及相关数据。</li>
              <li>对于本隐私政策的任何疑问，请通过"联系我们"中的 QQ 群联系管理员。</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-2">六、政策更新</h2>
            <p>
              本隐私政策可能不定期更新。更新后将在本页面公布，重大变更将通过站内通知告知。
            </p>
          </section>
        </div>

        <div className="mt-6 pt-4 border-t-2 border-dashed border-ink/20 dark:border-night-400 text-center">
          <Link to="/register" className="link-action text-sm font-bold">← 返回注册</Link>
        </div>
      </motion.div>
    </div>
  </div>
);

export default Privacy;
