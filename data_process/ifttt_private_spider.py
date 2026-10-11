import scrapy
import json
from external_config import load_ifttt_credentials


# 用来爬取用户自己创建的module（包含里面的trigger和action）

class IftttPrivateSpider(scrapy.Spider):
    name = "ifttt.com"
    start_urls = ["https://ifttt.com/login"]
    module_name_path = "./data/module_name.json"

    def __init__(self, *args, **kwargs):
        super(IftttPrivateSpider, self).__init__(*args, **kwargs)
        self.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"

        keys = load_ifttt_credentials()
        self.username = keys["username"]
        self.email = keys["email"]
        self.password = keys["password"]
        self.authorization = keys["authorization"]

    def parse(self, response):
        # get authenticity token
        # self.logger.info(response.text)
        # authenticity_token = response.css(
        #     "input[type=hidden]:nth-child(2)::attr(value)"
        # ).get()

        yield scrapy.FormRequest.from_response(
            response,
            formdata={
                "utf8": "✓",
                #"authenticity_token": authenticity_token,
                "return_to": None,
                "psu_": None,
                "user[username]": self.email,
                "user[password]": self.password,
                "commit": "Log+in",
            },
            headers={"User-Agent": self.user_agent},
            callback=self.login_check,
        )

    def login_check(self, response):
        # check if successfully logged in
        if b"The email and password don&#39;t match." in response.body:
            self.logger.error("Login failed: Wrong username or password.")
            return

        self.logger.info("Successfully login.")

        headers = {
            "Content-Type": "application/json",
            "Authorization": 'Token jwt="' + self.authorization + '"',
        }

        payload = {
            "query": "\n  query LoadPrivateServicesQuery {\n    me {\n      private_channels {\n        id\n        description_html\n        module_name\n        normalized_module_name\n        name\n        lrg_variant_image_url\n        lrg_monochrome_image_url\n        brand_color\n        incompatible_channels\n        allow_multiple_live_channels\n        tags\n        category {\n          name\n        }\n        public_triggers: triggers {\n          module_name\n          full_module_name\n          name\n          description\n          id\n          weight\n          tier\n        }\n        public_actions: actions {\n          module_name\n          full_module_name\n          name\n          description\n          id\n          weight\n          incompatible_triggers\n          tier\n        }\n        public_queries: queries {\n          module_name\n          full_module_name\n          name\n          description\n          id\n          weight\n          tier\n        }\n      }\n    }\n  }\n",
            "variables": {},
        }
        yield scrapy.Request(
            "https://ifttt.com/api/v3/graph",
            method="POST",
            body=json.dumps(payload),
            headers=headers,
            callback=self.get_private,
        )

    def get_private(self, response):
        json_data = response.json()

        with open("./data/private_module.json", "w") as f:
            json.dump(json_data, f, indent=4)
