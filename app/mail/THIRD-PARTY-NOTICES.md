# 许可说明

保留原包 AGPL-3.0 许可证。宿主 SDK 来自当前 Hana 官方脚手架，未修改 SDK 源码；第三方依赖保持原始许可证、版权和包元数据。

本包保留 IMAP、SMTP 与邮件文本解码所需的依赖。SMTP 依赖来自用户提供的原始 App 安装包，仅在受管后台加载。没有自动依赖安装程序或桌面通知可执行程序。

- @pinojs/redact 0.4.0：MIT
- atomic-sleep 1.0.0：MIT
- encoding-japanese 2.2.0：MIT
- iconv-lite 0.7.3：MIT
- imapflow 2.0.5：MIT
- @zone-eu/mailsplit 5.4.17：(MIT OR EUPL-1.1+)
- encoding-japanese 2.4.0：MIT
- libmime 5.4.4：MIT
- ip-address 10.7.2：MIT
- libbase64 1.3.0：MIT
- libmime 5.4.1：MIT
- libqp 2.1.1：MIT
- on-exit-leak-free 2.1.2：MIT
- pino 10.3.1：MIT
- pino-abstract-transport 3.0.0：MIT
- pino-std-serializers 7.1.0：MIT
- process-warning 5.1.0：MIT
- quick-format-unescaped 4.0.4：MIT
- real-require 0.2.0：MIT
- safe-stable-stringify 2.5.0：MIT
- safer-buffer 2.1.2：MIT
- smart-buffer 4.2.0：MIT
- socks 2.8.10：MIT
- sonic-boom 4.2.1：MIT
- split2 4.2.0：ISC
- thread-stream 4.2.0：MIT
- real-require 1.0.0：MIT

- nodemailer 9.0.3：MIT

新增 HTML 清理依赖（随包离线提供）：

- dayjs 1.11.23：MIT
- deepmerge 4.3.1：MIT
- dom-serializer 3.1.1：MIT
- domelementtype 3.0.0：BSD-2-Clause
- domhandler 6.0.1：BSD-2-Clause
- domutils 4.0.2：BSD-2-Clause
- entities 8.1.0：BSD-2-Clause
- escape-string-regexp 4.0.0：MIT
- htmlparser2 12.0.0：MIT
- is-plain-object 5.1.0：MIT
- launder 1.7.2：MIT
- nanoid 3.3.20：MIT
- parse-srcset 1.0.2：MIT
- picocolors 1.1.1：ISC
- postcss 8.5.29：MIT
- sanitize-html 2.18.0：MIT
- source-map-js 1.2.2：BSD-3-Clause

- DOMPurify 3.4.16：(MPL-2.0 OR Apache-2.0)，原许可证保留在 ui/DOMPurify-LICENSE。

## SunCalc 1.9.0 日出日落算法（BSD-2-Clause）

`lib/weather.mjs` 采用 SunCalc 1.9.0 的日出/日落公式子集，经精简与模块化适配，不包含月相等其它功能，不新增运行依赖。
原始源码：https://github.com/mourner/suncalc/blob/v1.9.0/suncalc.js
原始许可证：https://github.com/mourner/suncalc/blob/v1.9.0/LICENSE
算法源码标注：(c) 2011-2015, Vladimir Agafonkin。
结果按所选城市中心、当前当地日期、海平面无遮挡地平线估算，不建模地形与实际天气。

```text
Copyright (c) 2014, Vladimir Agafonkin
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are
permitted provided that the following conditions are met:

   1. Redistributions of source code must retain the above copyright notice, this list of
      conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright notice, this list
      of conditions and the following disclaimer in the documentation and/or other materials
      provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

beta.14 曾使用 wttr.in 公开 JSON 接口；beta.15 已移除这条默认天气链路，当前运行数据来源和署名见下方 Weather and coarse city lookup。日照计算仍沿用上述 SunCalc 子集与 BSD 许可。


## Earth Loader / Lucide assets

Earth Loader by Novaxlo, Uiverse MIT License: https://uiverse.io/Novaxlo/rotten-lionfish-4. Original SVG shapes are retained; size, colors, initial flash and animation playback were adapted for the mail workspace. Full license: ui/Earth-Loader-LICENSE.txt.

## Weather and coarse city lookup in beta.15

The beta.15 runtime queries small amounts of public city weather from NMC for local viewing. It does not bundle weather observations, original pages, imagery or downloaded weather caches in the extension archive. NMC's website statement restricts unauthorized commercial use; this local integration and connectivity check do not establish commercial redistribution authorization or a service-level agreement. Source: https://www.nmc.cn/ ; statement: https://www.nmc.cn/publish/cms/view/722665831f0a4e98800c41e691444963.html .

Fallback forecast data: MET Norway / Norwegian Meteorological Institute, Locationforecast 2.0, licensed under Creative Commons Attribution 4.0 International. Source: https://api.met.no/weatherapi/locationforecast/2.0/ ; license information: https://docs.api.met.no/doc/License.html ; license: https://creativecommons.org/licenses/by/4.0/ . This application selects the current forecast interval, normalizes timestamps and Celsius values, and translates condition categories into Chinese. Forecasts retain their issue and valid times and are not represented as observations. No provider logo is used. The active provider name appears in the weather settings.

Coarse network city lookup: IPIP.NET, https://myip.ipip.net ; usage information: https://www.ipip.net/myip.html . Only the supported coarse city result is retained in memory; public IP addresses are not returned to the UI, logged or persisted. No precise device location is requested. Public sources provide no guaranteed service availability.

Lucide Icons and Contributors: https://github.com/lucide-icons/lucide. Original sun, moon, cloud, rain, snow, sunrise and sunset SVG paths are bundled locally. Full ISC and derived Feather MIT notices: ui/Lucide-LICENSE.txt.
