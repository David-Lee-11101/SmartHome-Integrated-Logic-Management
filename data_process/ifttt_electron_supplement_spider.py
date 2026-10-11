import scrapy
import json
from external_config import load_ifttt_credentials


# 在elecreon_json文件里面的每一个操作trigger/action/query加入设备的label与value等信息

class IftttElectronSupplementSpider(scrapy.Spider):
    name = "ifttt.com"
    start_urls = ["https://ifttt.com/login"]
    trigger_module_name_path = "./data/electron_json/trigger_device_names.json"
    query_module_name_path = "./data/electron_json/query_device_names.json"
    action_module_name_path = "./data/electron_json/action_device_names.json"

    def __init__(self, *args, **kwargs):
        super(IftttElectronSupplementSpider, self).__init__(*args, **kwargs)
        self.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"

        keys = load_ifttt_credentials()
        self.username = keys["username"]
        self.email = keys["email"]
        self.password = keys["password"]
        self.authorization = keys["authorization"]

        with open(self.trigger_module_name_path, "r") as f:
            trigger_module_names = json.load(f)
        self.trigger_module_name_list = [item["module_name"] for item in trigger_module_names]

        with open(self.query_module_name_path, "r") as f:
            query_module_names = json.load(f)
        self.query_module_name_list = [item["module_name"] for item in query_module_names]

        with open(self.action_module_name_path, "r") as f:
            action_module_names = json.load(f)
        self.action_module_name_list = [item["module_name"] for item in action_module_names]

    def parse(self, response):

        yield scrapy.FormRequest.from_response(
            response,
            formdata={
                "utf8": "✓",
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

        headers = {"Content-Type": "application/json", "User-Agent": self.user_agent,
                   "Authorization": 'Token jwt="' + self.authorization + '"'}

        for trigger_module_name in self.trigger_module_name_list:
            with open("./data/electron_json/trigger/" + trigger_module_name + ".json", "r") as f:
                module_json = json.load(f)
                for item in module_json:
                    sub_module_name = item["module_name"]
                    sub_module_live_channels = item["live_channels"]
                    # 这里实现了对fields所有参数的遍历
                    if "trigger_fields" in item:
                        trigger_fields_list = item["trigger_fields"]
                        for sub_module_trigger_fields in trigger_fields_list:
                            # 首先判断是否存在账号数据，即是否有绑定的设备
                            if sub_module_live_channels:
                                for channel in sub_module_live_channels:
                                    channel_id = channel["id"]
                                    trigger_fields_name = sub_module_trigger_fields["name"]
                                    queryString = "https://ifttt.com/stored_fields/options?resolve_url=/stored_fields/triggers/" + trigger_module_name + "." + sub_module_name + "/" + trigger_fields_name + "/options&live_channel_id=" + channel_id
                                    yield scrapy.Request(
                                        url=queryString,
                                        headers=headers,
                                        method="GET",
                                        callback=self.get_trigger_module_channel_supplement,
                                        meta={"module_json": module_json, "trigger_module_name": trigger_module_name,
                                              "sub_module_name": sub_module_name, "channel_id": channel_id,
                                              "trigger_fields_name": trigger_fields_name}
                                    )

        for query_module_name in self.query_module_name_list:
            with open("./data/electron_json/query/" + query_module_name + ".json", "r") as f:
                module_json = json.load(f)
                for item in module_json:
                    sub_module_name = item["module_name"]
                    sub_module_live_channels = item["live_channels"]
                    if "query_fields" in item:
                        query_fields_list = item["query_fields"]
                        for sub_module_query_fields in query_fields_list:
                            # 首先判断是否存在账号数据，即是否有绑定的设备
                            if sub_module_live_channels:
                                for channel in sub_module_live_channels:
                                    channel_id = channel["id"]
                                    query_fields_name = sub_module_query_fields["name"]
                                    queryString = "https://ifttt.com/stored_fields/options?resolve_url=/stored_fields/queries/" + query_module_name + "." + sub_module_name + "/" + query_fields_name + "/options&live_channel_id=" + channel_id
                                    yield scrapy.Request(
                                        url=queryString,
                                        headers=headers,
                                        method="GET",
                                        callback=self.get_query_module_channel_supplement,
                                        meta={"module_json": module_json, "query_module_name": query_module_name,
                                              "sub_module_name": sub_module_name, "channel_id": channel_id,
                                              "query_fields_name": query_fields_name}
                                    )

        for action_module_name in self.action_module_name_list:
            with open("./data/electron_json/action/" + action_module_name + ".json", "r") as f:
                module_json = json.load(f)
                for item in module_json:
                    sub_module_name = item["module_name"]
                    sub_module_live_channels = item["live_channels"]
                    # 这里实现了对fields所有参数的遍历
                    if "action_fields" in item:
                        action_fields_list = item["action_fields"]
                        for sub_module_action_fields in action_fields_list:
                            # 首先判断是否存在账号数据，即是否有绑定的设备
                            if sub_module_live_channels:
                                for channel in sub_module_live_channels:
                                    channel_id = channel["id"]
                                    action_fields_name = sub_module_action_fields["name"]
                                    queryString = "https://ifttt.com/stored_fields/options?resolve_url=/stored_fields/actions/" + action_module_name + "." + sub_module_name + "/" + action_fields_name + "/options&live_channel_id=" + channel_id
                                    yield scrapy.Request(
                                        url=queryString,
                                        headers=headers,
                                        method="GET",
                                        callback=self.get_action_module_channel_supplement,
                                        meta={"module_json": module_json, "action_module_name": action_module_name,
                                              "sub_module_name": sub_module_name, "channel_id": channel_id,
                                              "action_fields_name": action_fields_name}
                                    )


    # 如果数据为空的话，macaddress里面返回的直接是空数据
    def get_trigger_module_channel_supplement(self, response):
        module_json = response.meta["module_json"]
        trigger_module_name = response.meta["trigger_module_name"]
        sub_module_name = response.meta["sub_module_name"]
        channel_id = response.meta["channel_id"]
        trigger_fields_name = response.meta["trigger_fields_name"]
        supplement = response.json()

        # 在循环外创建一个空的 target_json 列表
        target_json = []
        for item in module_json:
            if (item["module_name"] == sub_module_name):
                channels = item["live_channels"]
                for target in channels:
                    if target["id"] == channel_id:
                        handle = {
                            "id": target["id"],
                            "user_name_field": target["user_name_field"],
                            "offline": target["offline"],
                            trigger_fields_name: supplement[trigger_fields_name],
                        }
                        target.update(handle)
            # 在每次循环结束后将 item 添加到 target_json 列表中
            target_json.append(item)
        # 将整个 target_json 列表写入文件
        with open("./data/electron_json/trigger/" + trigger_module_name + ".json", "w") as f:
            json.dump(target_json, f, indent=4)

        # target_json = module_json
        # for item in target_json:
        #     if item["module_name"] == sub_module_name:
        #         channels = item["live_channels"]
        #         for target in channels:
        #             if target["id"] == channel_id:
        #                 # 在随后的修改中，可以外层for循环，我们每次往里面append新的内容，即trigger_fields_name：supplement[trigger_fields_name]
        #                 handle = {
        #                     "id": target["id"],
        #                     "user_name_field": target["user_name_field"],
        #                     "offline": target["offline"],
        #                     # 为了与前端读取数据时相呼应，此处暂时将所有的设备数据的键名为“macaddress”
        #                     "macaddress": supplement[trigger_fields_name],
        #                 }
        #                 target.update(handle)
        # with open("./data/electron_json/trigger/" + trigger_module_name + ".json", "w") as f:
        #     json.dump(target_json, f, indent=4)

    def get_query_module_channel_supplement(self, response):
        module_json = response.meta["module_json"]
        query_module_name = response.meta["query_module_name"]
        sub_module_name = response.meta["sub_module_name"]
        channel_id = response.meta["channel_id"]
        query_fields_name = response.meta["query_fields_name"]
        supplement = response.json()

        # 在循环外创建一个空的 target_json 列表
        target_json = []
        for item in module_json:
            if (item["module_name"] == sub_module_name):
                channels = item["live_channels"]
                for target in channels:
                    if target["id"] == channel_id:
                        handle = {
                            "id": target["id"],
                            "user_name_field": target["user_name_field"],
                            "offline": target["offline"],
                            query_fields_name: supplement[query_fields_name],
                        }
                        target.update(handle)
            # 在每次循环结束后将 item 添加到 target_json 列表中
            target_json.append(item)
        # 将整个 target_json 列表写入文件
        with open("./data/electron_json/query/" + query_module_name + ".json", "w") as f:
            json.dump(target_json, f, indent=4)

        # target_json = module_json
        # for item in target_json:
        #     if (item["module_name"] == sub_module_name):
        #         channels = item["live_channels"]
        #         for target in channels:
        #             if target["id"] == channel_id:
        #                 handle = {"id": target["id"],
        #                           "user_name_field": target["user_name_field"],
        #                           "offline": target["offline"],
        #                           "macaddress": supplement[query_fields_name], }
        #                 target.update(handle)
        # with open("./data/electron_json/query/" + query_module_name + ".json", "w") as f:
        #     json.dump(target_json, f, indent=4)

    def get_action_module_channel_supplement(self, response):
        module_json = response.meta["module_json"]
        action_module_name = response.meta["action_module_name"]
        sub_module_name = response.meta["sub_module_name"]
        channel_id = response.meta["channel_id"]
        action_fields_name = response.meta["action_fields_name"]
        supplement = response.json()

        # 在循环外创建一个空的 target_json 列表
        target_json = []
        for item in module_json:
            if (item["module_name"] == sub_module_name):
                channels = item["live_channels"]
                for target in channels:
                    if target["id"] == channel_id:
                        handle = {
                            "id": target["id"],
                            "user_name_field": target["user_name_field"],
                            "offline": target["offline"],
                            action_fields_name: supplement[action_fields_name],
                        }
                        target.update(handle)
            # 在每次循环结束后将 item 添加到 target_json 列表中
            target_json.append(item)
        # 将整个 target_json 列表写入文件
        with open("./data/electron_json/action/" + action_module_name + ".json", "w") as f:
            json.dump(target_json, f, indent=4)

        # target_json = module_json
        # for item in target_json:
        #     if (item["module_name"] == sub_module_name):
        #         channels = item["live_channels"]
        #         for target in channels:
        #             if target["id"] == channel_id:
        #                 handle = {
        #                     "id": target["id"],
        #                     "user_name_field": target["user_name_field"],
        #                     "offline": target["offline"],
        #                     action_fields_name: supplement[action_fields_name],
        #                 }
        #                 target.update(handle)
        # with open("./data/electron_json/action/" + action_module_name + ".json", "w") as f:
        #     json.dump(target_json, f, indent=4)
