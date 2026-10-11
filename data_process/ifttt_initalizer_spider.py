import scrapy
import json
from external_config import load_ifttt_credentials


# scrapy runspider .\src\data_process\ifttt_initalizer_spider.py
# 爬取了所有厂商的module，每一个module下面包含了厂商提供的所有trigger和action

class IftttInitalizerSpider(scrapy.Spider):
    name = "ifttt.com"
    start_urls = ["https://ifttt.com/login"]

    def __init__(self, *args, **kwargs):
        super(IftttInitalizerSpider, self).__init__(*args, **kwargs)
        self.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"

        keys = load_ifttt_credentials()
        self.username = keys["username"]
        self.email = keys["email"]
        self.password = keys["password"]
        self.authorization = keys["authorization"]

    def parse(self, response):
        # get authenticity token
        # authenticity_token = response.css(
        #     "input[type=hidden]:nth-child(2)::attr(value)"
        # ).get()

        yield scrapy.FormRequest.from_response(
            response,
            formdata={
                "utf8": "✓",
                # "authenticity_token": authenticity_token,
                "return_to": None,
                "psu_": None,
                "user[username]": self.email,
                "user[password]": self.password,
                "commit": "Log+in",
            },
            headers={"User-Agent": self.user_agent, "Authorization": 'Token jwt="' + self.authorization + '"'},
            callback=self.login_check,
        )

    def login_check(self, response):
        # check if successfully logged in
        if b"The email and password don&#39;t match." in response.body:
            self.logger.error("Login failed: Wrong username or password.")
            return

        self.logger.info("Successfully login.")
        yield scrapy.Request(
            "https://ifttt.com/create",
            callback=self.get_all_if_device,
            headers={"User-Agent": self.user_agent, "Authorization": 'Token jwt="' + self.authorization + '"'},
        )

    def get_all_if_device(self, response):
        # F12 source ifttt.com create下面可以找到 , 被写到了Html页面元素中
        react_props = response.css("div::attr(data-react-props)").get()
        react_props_json = json.loads(react_props)

        # 保存为 JSON 文件
        with open("./data/public_module.json", "w") as f:
            json.dump(react_props_json, f, indent=4)

        with open("./data/public_module.json", "r") as q:
            rawdata = json.load(q)

        cleaned_data = [
            {"module_name": item["module_name"]}
            for item in rawdata["preloadedServices"]
        ]
        with open("./data/module_name.json", "w") as cleaned_f:
            json.dump(cleaned_data, cleaned_f, indent=4)
