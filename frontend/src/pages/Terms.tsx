import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const Terms: React.FC = () => (
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
          <h1 className="font-display text-2xl text-ink dark:text-primary-100">用户协议</h1>
          <p className="mt-1 text-sm text-ink-muted">最后更新于 2026 年 6 月</p>
        </div>

        <div className="prose prose-sm max-w-none text-ink dark:text-primary-100 space-y-4">
          <section>
            <h2 className="font-bold text-lg mb-2">一、总则</h2>
            <p>
              欢迎使用 AniMap（以下简称"本平台"）。本协议是您与本平台之间关于使用 AniMap
              服务的法律协议。您在注册、登录或使用本平台服务时，即表示您已阅读、理解并同意
              本协议的全部内容。
            </p>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-2">二、账号注册与使用</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>您承诺在注册时提供的所有信息真实、准确、完整。</li>
              <li>个人用户注册后可浏览展会信息、发布活动、收藏感兴趣的内容。</li>
              <li>商户用户注册后需经本平台审核通过方可登录使用。</li>
              <li>您应妥善保管账号和密码，因账号泄露导致的损失由您自行承担。</li>
              <li>每个邮箱仅可注册一个账号，禁止批量注册或使用虚假邮箱。</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-2">三、用户行为规范</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>不得发布违法、违规、侵权、虚假或恶意信息。</li>
              <li>不得发布与本平台定位无关的垃圾广告或推广信息。</li>
              <li>不得利用本平台进行任何形式的网络攻击、数据爬取或恶意注册。</li>
              <li>不得冒充他人身份或使用他人的账号进行操作。</li>
              <li>发布活动信息时应确保活动内容真实有效，不得虚假宣传。</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-2">四、内容与知识产权</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>您上传至本平台的内容（包括图片、文字、评论等），您保留所有权。</li>
              <li>您授予本平台在运营范围内使用、展示、修改您上传内容的权利。</li>
              <li>本平台的名称、标识、界面设计、源代码等知识产权归本平台所有。</li>
              <li>未经授权，不得复制、修改、传播本平台的任何内容。</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-2">五、免责声明</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>本平台作为信息聚合工具，不对第三方展会的真实性和质量承担责任。</li>
              <li>本平台不对因网络故障、服务器维护等原因造成的服务中断承担责任。</li>
              <li>用户之间因展会、交易等产生的纠纷，应由当事方自行协商解决。</li>
              <li>本平台有权根据运营需要调整服务内容或中断服务。</li>
            </ul>
          </section>

          <section>
            <h2 className="font-bold text-lg mb-2">六、协议修改</h2>
            <p>
              本平台有权根据需要修改本协议条款。修改后的协议将在本页面公布，并自公布之日起生效。
              您继续使用本平台服务即表示同意修改后的协议。
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

export default Terms;
